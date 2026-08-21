import { json, requireEnv, serviceClient } from '../_shared/utils.ts';

/**
 * Webhook do Checkout da InfinitePay (Pix).
 *
 * ATENÇÃO — modelo de segurança:
 * A InfinitePay usa webhook DINÂMICO (a URL vai em cada cobrança) e o POST de
 * aviso não vem assinado. Portanto, quem recebe este POST NÃO pode confiar
 * nele: qualquer pessoa que descubra a URL poderia forjar "pedido pago".
 *
 * Por isso o fluxo é: recebeu o aviso → chama `payment_check` na InfinitePay →
 * só marca como pago se a própria InfinitePay confirmar que está pago E que o
 * valor bate com o total do pedido no nosso banco.
 *
 * Resposta esperada pela InfinitePay:
 *   sucesso → 200 {"success": true,  "message": null}
 *   erro    → 400 {"success": false, "message": "..."}
 */

const CHECK_URL = 'https://api.checkout.infinitepay.io/payment_check';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ success: false, message: 'Método não permitido.' }, 405);
  }

  let event: Record<string, unknown> = {};

  try {
    event = await req.json();
    console.log('webhook-infinitepay recebido:', JSON.stringify(event));

    const orderId = String(event.order_nsu ?? '');
    const transactionNsu = String(event.transaction_nsu ?? '');
    const invoiceSlug = String(event.invoice_slug ?? '');

    if (!orderId) {
      return json({ success: false, message: 'order_nsu ausente.' }, 400);
    }

    const admin = serviceClient();

    const { data: order } = await admin
      .from('orders')
      .select('id, code, total_cents, payment_status')
      .eq('id', orderId)
      .single();

    if (!order) {
      return json({ success: false, message: 'Pedido não encontrado.' }, 400);
    }

    // Idempotência: a InfinitePay pode reenviar o mesmo aviso.
    if (order.payment_status === 'pago') {
      return json({ success: true, message: null });
    }

    // ----------------------------------------------------------------------
    // Verificação na fonte — este é o passo que dá segurança ao webhook.
    // ----------------------------------------------------------------------
    const checkResponse = await fetch(CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: requireEnv('INFINITEPAY_HANDLE'),
        transaction_nsu: transactionNsu,
        external_order_nsu: orderId,
        slug: invoiceSlug,
      }),
    });

    const check = await checkResponse.json().catch(() => ({}));
    console.log('payment_check:', checkResponse.status, JSON.stringify(check));

    if (!checkResponse.ok || check?.success !== true || check?.paid !== true) {
      await admin.rpc('mark_order_payment_failed', {
        p_order_id: order.id,
        p_reason: 'InfinitePay não confirmou o pagamento na verificação.',
      });
      return json({ success: false, message: 'Pagamento não confirmado pela InfinitePay.' }, 400);
    }

    // O valor confirmado precisa cobrir o total do pedido.
    const paidAmount = Number(check.paid_amount ?? check.amount ?? 0);
    if (paidAmount < order.total_cents) {
      console.error(
        `Valor divergente no pedido ${order.code}: pago ${paidAmount}, esperado ${order.total_cents}`
      );
      return json({ success: false, message: 'Valor pago diferente do total do pedido.' }, 400);
    }

    await admin.rpc('mark_order_paid', {
      p_order_id: order.id,
      p_provider: 'infinitepay',
      p_reference: transactionNsu || invoiceSlug,
      p_payload: {
        infinitepay_check: check,
        receipt_url: event.receipt_url ?? null,
        capture_method: check.capture_method ?? event.capture_method ?? null,
      },
    });

    // No checkout da InfinitePay o parcelamento é escolhido pelo cliente na
    // tela deles, então o número real só se conhece agora — gravamos para o
    // relatório não mostrar sempre 1x.
    const installments = Number(check.installments ?? event.installments ?? 0);
    if (installments > 1) {
      await admin.from('orders').update({ installments }).eq('id', order.id);
    }

    console.log(`Pedido ${order.code} confirmado via InfinitePay.`);
    return json({ success: true, message: null });
  } catch (error) {
    console.error('webhook-infinitepay:', error, JSON.stringify(event));
    return json({ success: false, message: (error as Error).message }, 400);
  }
});
