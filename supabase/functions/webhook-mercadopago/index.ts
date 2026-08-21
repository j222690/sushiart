import { json, requireEnv, safeEqual, serviceClient } from '../_shared/utils.ts';

/**
 * Webhook do Mercado Pago (cartão de crédito e Pix).
 *
 * Duas travas, e as duas importam:
 *
 *   1. ASSINATURA — o MP manda `x-signature: ts=...,v1=...`. O v1 é um
 *      HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 *      com o segredo cadastrado no painel deles. Confere antes de olhar o corpo.
 *
 *   2. CONFIRMAÇÃO NA FONTE — mesmo com assinatura válida, o corpo do aviso não
 *      diz quanto foi pago. Buscamos o pagamento na API do MP e só marcamos como
 *      pago se ELES disserem `approved` e o valor cobrir o total gravado no
 *      nosso banco. É a mesma postura do webhook da InfinitePay.
 *
 * O MP reenvia o aviso até receber 200. Por isso caso irrecuperável (pedido
 * inexistente) também responde 200: reenviar não resolveria.
 */

const MP_API = 'https://api.mercadopago.com';

/** Confere o HMAC do cabeçalho `x-signature`. */
async function assinaturaValida(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
  if (!secret) {
    // Sem segredo cadastrado não dá para verificar. Não é motivo para recusar:
    // a confirmação na fonte, logo abaixo, é quem realmente libera o pedido.
    console.warn('MERCADOPAGO_WEBHOOK_SECRET ausente — pulando verificação de assinatura.');
    return true;
  }

  const header = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';

  const partes = Object.fromEntries(
    header.split(',').map((parte) => {
      const [chave, ...resto] = parte.split('=');
      return [chave.trim(), resto.join('=').trim()];
    })
  );

  if (!partes.ts || !partes.v1) return false;

  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const assinatura = new Uint8Array(
    await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto))
  );
  const esperado = [...assinatura].map((b) => b.toString(16).padStart(2, '0')).join('');

  return safeEqual(esperado, partes.v1);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const evento = await req.json().catch(() => ({}));
    console.log('webhook-mercadopago:', JSON.stringify(evento).slice(0, 300));

    const tipo = String(evento.type ?? evento.topic ?? '');
    if (tipo !== 'payment') {
      return json({ received: true, ignored: tipo || 'sem tipo' });
    }

    // O id do pagamento vem no corpo e também na query, dependendo do formato.
    const url = new URL(req.url);
    const paymentId = String(
      url.searchParams.get('data.id') ?? evento.data?.id ?? evento.resource ?? ''
    );
    if (!paymentId) return json({ received: true, ignored: 'sem data.id' });

    if (!(await assinaturaValida(req, paymentId))) {
      console.warn('webhook-mercadopago: assinatura inválida.');
      return json({ error: 'Não autorizado.' }, 401);
    }

    // ----------------------------------------------------------------------
    // Confirmação na fonte.
    // ----------------------------------------------------------------------
    const resposta = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${requireEnv('MERCADOPAGO_ACCESS_TOKEN')}` },
    });

    const pagamento = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('webhook-mercadopago: falha ao consultar', resposta.status, pagamento);
      // 500 para o MP tentar de novo — pode ter sido instabilidade da API.
      return json({ error: 'Não foi possível consultar o pagamento.' }, 500);
    }

    const orderId = pagamento.external_reference;
    if (!orderId) {
      console.warn('webhook-mercadopago: pagamento sem external_reference', paymentId);
      return json({ received: true, ignored: 'sem external_reference' });
    }

    const admin = serviceClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, code, total_cents, payment_status')
      .eq('id', orderId)
      .single();

    if (!order) {
      console.warn('webhook-mercadopago: pedido não encontrado', orderId);
      return json({ received: true, ignored: 'pedido não encontrado' });
    }

    const status = String(pagamento.status ?? '');

    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
      await admin.rpc('mark_order_payment_failed', {
        p_order_id: order.id,
        p_reason: `Mercado Pago: ${pagamento.status_detail ?? status}`,
      });
      return json({ received: true, status });
    }

    if (status !== 'approved') {
      // 'pending' / 'in_process': o MP avisa de novo quando resolver.
      return json({ received: true, ignored: status });
    }

    if (order.payment_status === 'pago') {
      return json({ received: true, already_paid: true });
    }

    // O MP devolve reais decimais; nosso banco guarda centavos.
    const pagoCentavos = Math.round(
      Number(pagamento.transaction_details?.total_paid_amount ?? pagamento.transaction_amount ?? 0) *
        100
    );

    if (pagoCentavos < order.total_cents) {
      console.error(
        `Valor divergente no pedido ${order.code}: pago ${pagoCentavos}, esperado ${order.total_cents}`
      );
      return json({ received: true, ignored: 'valor divergente' });
    }

    await admin.rpc('mark_order_paid', {
      p_order_id: order.id,
      p_provider: 'mercadopago',
      p_reference: String(pagamento.id),
      p_payload: {
        mercadopago_status: status,
        payment_type: pagamento.payment_type_id ?? null,
        installments: pagamento.installments ?? null,
        net_amount: pagamento.transaction_details?.net_received_amount ?? null,
        receipt_url: pagamento.transaction_details?.external_resource_url ?? null,
      },
    });

    // No Checkout Pro quem escolhe o parcelamento é o cliente, na tela do MP —
    // o número real só se conhece agora.
    const parcelas = Number(pagamento.installments ?? 0);
    if (parcelas > 1) {
      await admin.from('orders').update({ installments: parcelas }).eq('id', order.id);
    }

    console.log(`Pedido ${order.code} confirmado via Mercado Pago.`);
    return json({ received: true });
  } catch (error) {
    console.error('webhook-mercadopago:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
