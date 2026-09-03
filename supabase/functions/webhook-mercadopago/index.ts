import { json, requireEnv, safeEqual, serviceClient } from '../_shared/utils.ts';
import { contaMercadoPago } from '../_shared/mercadopago.ts';

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

/**
 * Confirma o pagamento NA FONTE e move o pedido.
 *
 * Compartilhada pelos dois formatos de aviso do Mercado Pago (POST assinado e
 * GET no estilo IPN antigo). Concentrar aqui é o que garante que o caminho
 * antigo passe pelas mesmas conferências de status e de valor que o novo —
 * um deles ficar mais frouxo que o outro seria a forma mais fácil de abrir
 * um buraco sem perceber.
 */
async function confirmar(paymentId: string): Promise<Response> {
  try {
  // ----------------------------------------------------------------------
  // Confirmação na fonte.
  // ----------------------------------------------------------------------
  // Na MESMA conta em que a cobrança nasceu. Depois que o dono conecta a conta
  // dele, um pagamento criado por ela é invisível para o token de ambiente: a
  // consulta voltaria 404, o webhook responderia 500, o Mercado Pago tentaria
  // de novo umas vezes e desistiria — e o pedido ficaria preso em "aguardando
  // pagamento" com o dinheiro já cobrado do cliente.
  const conta = await contaMercadoPago();

  const resposta = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${conta.token}` },
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
    console.error('webhook-mercadopago confirmar:', error);
    return json({ error: (error as Error).message }, 500);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Notificação no formato IPN antigo: `GET ...?topic=payment&id=123`.
  // O Mercado Pago ainda dispara este formato dependendo de como a conta foi
  // configurada. Recusar com 405 significaria pedido pago que nunca sai de
  // `aguardando_pagamento` — e ninguém descobre até o cliente reclamar.
  if (req.method === 'GET') {
    const topico = url.searchParams.get('topic') ?? url.searchParams.get('type');
    const id = url.searchParams.get('id') ?? url.searchParams.get('data.id');

    if (topico !== 'payment' || !id) {
      return json({ received: true, ignored: topico ?? 'sem topico' });
    }
    // Sem corpo não há assinatura para conferir; a confirmação na fonte, que é
    // quem realmente libera o pedido, acontece igual dentro de `confirmar`.
    return confirmar(id);
  }

  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const evento = await req.json().catch(() => ({}));
    console.log('webhook-mercadopago:', JSON.stringify(evento).slice(0, 300));

    const tipo = String(evento.type ?? evento.topic ?? '');
    if (tipo !== 'payment') {
      return json({ received: true, ignored: tipo || 'sem tipo' });
    }

    // O id do pagamento vem no corpo e também na query, dependendo do formato.
    const paymentId = String(
      url.searchParams.get('data.id') ?? evento.data?.id ?? evento.resource ?? ''
    );
    if (!paymentId) return json({ received: true, ignored: 'sem data.id' });

    if (!(await assinaturaValida(req, paymentId))) {
      console.warn('webhook-mercadopago: assinatura inválida.');
      return json({ error: 'Não autorizado.' }, 401);
    }

    return confirmar(paymentId);
  } catch (error) {
    console.error('webhook-mercadopago:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
