import { json, safeEqual, serviceClient } from '../_shared/utils.ts';

/**
 * Webhook do Asaas (cartão de crédito).
 *
 * Segurança: o Asaas permite cadastrar um token de autenticação no painel, que
 * ele envia no header `asaas-access-token`. Comparamos com o nosso secret antes
 * de olhar o corpo da requisição — sem isso, qualquer um poderia POSTar aqui e
 * marcar pedidos como pagos.
 *
 * Também reconferimos o valor contra o total do pedido no banco.
 */

// Eventos que significam "dinheiro confirmado".
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

// Eventos que significam "não vai entrar".
const FAILED_EVENTS = new Set([
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REFUND_IN_PROGRESS',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    const receivedToken = req.headers.get('asaas-access-token') ?? '';

    if (!expectedToken) {
      console.error('ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook.');
      return json({ error: 'Webhook não configurado.' }, 500);
    }
    if (!safeEqual(receivedToken, expectedToken)) {
      console.warn('webhook-asaas: token inválido.');
      return json({ error: 'Não autorizado.' }, 401);
    }

    const event = await req.json();
    const type = String(event.event ?? '');
    const payment = event.payment ?? {};

    console.log('webhook-asaas:', type, payment.id);

    // O pedido pode ser achado pelo externalReference (id que enviamos) ou
    // pelo payment_ref guardado quando a cobrança foi criada.
    const orderId = payment.externalReference;
    const admin = serviceClient();

    let query = admin.from('orders').select('id, code, total_cents, payment_status');
    query = orderId ? query.eq('id', orderId) : query.eq('payment_ref', payment.id);

    const { data: order } = await query.single();

    if (!order) {
      // 200 de propósito: sem o pedido, reenviar não resolve — e o Asaas
      // desativa o webhook depois de muitas falhas seguidas.
      console.warn('webhook-asaas: pedido não encontrado para', payment.id);
      return json({ received: true, ignored: 'pedido não encontrado' });
    }

    if (FAILED_EVENTS.has(type)) {
      await admin.rpc('mark_order_payment_failed', {
        p_order_id: order.id,
        p_reason: `Asaas: ${type}`,
      });
      return json({ received: true });
    }

    if (!PAID_EVENTS.has(type)) {
      return json({ received: true, ignored: type });
    }

    if (order.payment_status === 'pago') {
      return json({ received: true, already_paid: true });
    }

    // Asaas manda valores em reais decimais; nosso banco guarda centavos.
    const paidCents = Math.round(Number(payment.value ?? 0) * 100);
    if (paidCents < order.total_cents) {
      console.error(
        `Valor divergente no pedido ${order.code}: pago ${paidCents}, esperado ${order.total_cents}`
      );
      return json({ received: true, ignored: 'valor divergente' });
    }

    await admin.rpc('mark_order_paid', {
      p_order_id: order.id,
      p_provider: 'asaas',
      p_reference: payment.id,
      p_payload: {
        asaas_event: type,
        billing_type: payment.billingType ?? null,
        installment_count: payment.installmentCount ?? null,
        net_value: payment.netValue ?? null,
        invoice_url: payment.invoiceUrl ?? null,
      },
    });

    console.log(`Pedido ${order.code} confirmado via Asaas.`);
    return json({ received: true });
  } catch (error) {
    console.error('webhook-asaas:', error);
    return json({ error: (error as Error).message }, 400);
  }
});
