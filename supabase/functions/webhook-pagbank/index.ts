import { json, requireEnv, safeEqual, serviceClient } from '../_shared/utils.ts';

/**
 * Webhook do PagBank (cartão de débito e Pix).
 *
 * Modelo de segurança — quem realmente libera o pedido é a CONSULTA À API,
 * não o aviso recebido:
 *
 *   · O PagBank manda `x-authenticity-token`, que é o SHA-256 de
 *     `{seu_token}-{corpo}`. Conferimos e registramos divergência.
 *   · Mas mesmo com o hash batendo, buscamos o pedido na API do PagBank com o
 *     nosso token privado e só marcamos como pago se ELES disserem PAID e o
 *     valor cobrir o total gravado no nosso banco.
 *
 * Essa ordem é proposital. Um POST forjado não consegue nada além de nos fazer
 * reconsultar um pedido que já existe — não há caminho em que o corpo do aviso,
 * sozinho, mova dinheiro. É a mesma postura do webhook da InfinitePay.
 */

function pagBankBase() {
  return Deno.env.get('PAGBANK_ENV') === 'production'
    ? 'https://api.pagseguro.com'
    : 'https://sandbox.api.pagseguro.com';
}

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const token = requireEnv('PAGBANK_TOKEN');
    const corpoBruto = await req.text();

    // Conferência do hash. Não é ela que autoriza — ver o cabeçalho do arquivo.
    const recebido = req.headers.get('x-authenticity-token') ?? '';
    if (recebido) {
      const esperado = await sha256Hex(`${token}-${corpoBruto}`);
      if (!safeEqual(recebido, esperado)) {
        console.warn(
          'webhook-pagbank: x-authenticity-token não confere. ' +
            'Seguindo para a consulta na API, que é quem confirma o pagamento.'
        );
      }
    }

    const evento = JSON.parse(corpoBruto || '{}');
    console.log('webhook-pagbank:', JSON.stringify(evento).slice(0, 300));

    // O aviso chega tanto como Order quanto como Checkout, dependendo do fluxo.
    const orderId = evento.reference_id ?? evento.charges?.[0]?.reference_id;
    const pagBankOrderId = evento.id;

    if (!orderId) {
      console.warn('webhook-pagbank: aviso sem reference_id.');
      return json({ received: true, ignored: 'sem reference_id' });
    }

    const admin = serviceClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, code, total_cents, payment_status')
      .eq('id', orderId)
      .single();

    if (!order) {
      console.warn('webhook-pagbank: pedido não encontrado', orderId);
      return json({ received: true, ignored: 'pedido não encontrado' });
    }

    if (order.payment_status === 'pago') {
      return json({ received: true, already_paid: true });
    }

    // ----------------------------------------------------------------------
    // Consulta na fonte — é este passo que dá segurança ao webhook.
    // ----------------------------------------------------------------------
    const resposta = await fetch(`${pagBankBase()}/orders/${pagBankOrderId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const pedido = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('webhook-pagbank: falha ao consultar', resposta.status, pedido);
      // 500 para o PagBank tentar de novo.
      return json({ error: 'Não foi possível consultar o pedido.' }, 500);
    }

    // Um pedido pode ter mais de uma cobrança; vale a que foi paga.
    const cobrancas = pedido.charges ?? [];
    const paga = cobrancas.find((c: any) => c.status === 'PAID');

    if (!paga) {
      const recusada = cobrancas.find((c: any) =>
        ['DECLINED', 'CANCELED'].includes(String(c.status))
      );

      if (recusada) {
        await admin.rpc('mark_order_payment_failed', {
          p_order_id: order.id,
          p_reason: `PagBank: ${recusada.payment_response?.message ?? recusada.status}`,
        });
        return json({ received: true, status: recusada.status });
      }

      // Ainda em análise (WAITING/IN_ANALYSIS): o PagBank avisa de novo.
      return json({ received: true, ignored: 'pagamento ainda não confirmado' });
    }

    // O PagBank já trabalha em centavos — nada de converter.
    const pagoCentavos = Number(paga.amount?.value ?? 0);
    if (pagoCentavos < order.total_cents) {
      console.error(
        `Valor divergente no pedido ${order.code}: pago ${pagoCentavos}, esperado ${order.total_cents}`
      );
      return json({ received: true, ignored: 'valor divergente' });
    }

    await admin.rpc('mark_order_paid', {
      p_order_id: order.id,
      p_provider: 'pagbank',
      p_reference: String(paga.id ?? pagBankOrderId),
      p_payload: {
        pagbank_status: paga.status,
        payment_method: paga.payment_method?.type ?? null,
        brand: paga.payment_method?.card?.brand ?? null,
        installments: paga.payment_method?.installments ?? null,
        paid_at: paga.paid_at ?? null,
      },
    });

    const parcelas = Number(paga.payment_method?.installments ?? 0);
    if (parcelas > 1) {
      await admin.from('orders').update({ installments: parcelas }).eq('id', order.id);
    }

    console.log(`Pedido ${order.code} confirmado via PagBank.`);
    return json({ received: true });
  } catch (error) {
    console.error('webhook-pagbank:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
