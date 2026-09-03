import { json, safeEqual, serviceClient } from '../_shared/utils.ts';

/**
 * Purchase pelo lado do servidor — Meta Conversions API.
 *
 * POR QUE EXISTE, se o Pixel do navegador já manda o mesmo evento:
 *
 * O Pixel some. Bloqueador de anúncio, aba fechada antes do carregamento,
 * iPhone com rastreamento limitado, rede que caiu na hora do "pagamento
 * aprovado" — em qualquer um desses a venda aconteceu e a Meta não ficou
 * sabendo. Sem o número real de vendas, a otimização de campanha decide errado.
 *
 * Este caminho sai do BANCO, quando o pedido é marcado como pago, e por isso
 * não depende de navegador nenhum.
 *
 * OS DOIS NÃO SE SOMAM
 *
 * Os dois lados mandam o MESMO `event_id` (`purchase_<order_id>`). É assim que
 * a Meta reconhece que são o mesmo acontecimento e conta uma venda só. Sem
 * isso, cada compra viraria duas e o custo por conversão apareceria pela
 * metade — número bom, decisão ruim.
 *
 * O TOKEN
 *
 * `META_CAPI_TOKEN` vive aqui, nos segredos da função, e nunca no app: com ele
 * em mãos qualquer um envia eventos falsos para a conta de anúncios do
 * restaurante e estraga a otimização.
 */

const API = 'https://graph.facebook.com/v21.0';

/**
 * A Meta exige e-mail e telefone em SHA-256, minúsculo e sem formatação.
 *
 * Sem normalizar, o mesmo cliente vira pessoas diferentes ("A@x.com" e
 * "a@x.com" dão hashes distintos) e o casamento com o público da Meta
 * simplesmente não acontece — o dado vai, mas não serve para nada.
 */
async function hash(valor: string | null | undefined): Promise<string | null> {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  if (!limpo) return null;

  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(limpo));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Telefone só com dígitos e com código do país, como a Meta pede. */
async function hashTelefone(telefone: string | null | undefined): Promise<string | null> {
  if (!telefone) return null;
  let digitos = telefone.replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return hash(digitos);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  // Quem chama é o gatilho do banco, com o mesmo segredo do send-push. Aberto,
  // este endereço deixaria qualquer um inventar vendas na conta de anúncios.
  const esperado = Deno.env.get('PUSH_HOOK_SECRET');
  if (!esperado || !safeEqual(req.headers.get('x-push-secret') ?? '', esperado)) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  const token = Deno.env.get('META_CAPI_TOKEN');
  const pixelId = Deno.env.get('META_PIXEL_ID');

  // Sem configuração não é erro: é o restaurante que ainda não ligou a
  // Conversions API. Responder 200 evita o banco ficar reprocessando.
  if (!token || !pixelId) {
    return json({ skipped: 'META_CAPI_TOKEN ou META_PIXEL_ID não configurados' });
  }

  try {
    const { order_id: orderId } = await req.json();
    if (!orderId) return json({ error: 'order_id ausente.' }, 400);

    const admin = serviceClient();

    const { data: pedido } = await admin
      .from('orders')
      .select('id, code, total_cents, status, created_at, customer_id, order_items(product_id, quantity, unit_price_cents)')
      .eq('id', orderId)
      .single();

    if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);

    // Confere aqui também, e não só no gatilho: esta função é a última porta
    // antes de a Meta receber uma venda. Um chamador errado não pode fazer o
    // sistema declarar faturamento que não existe.
    const PAGO = ['pago', 'confirmado_entrega', 'em_preparo', 'saiu_para_entrega',
                  'pronto_para_retirada', 'entregue'];
    if (!PAGO.includes(pedido.status)) {
      return json({ skipped: `pedido em '${pedido.status}', não é venda confirmada` });
    }

    const { data: cliente } = pedido.customer_id
      ? await admin.from('customers').select('email, phone').eq('id', pedido.customer_id).single()
      : { data: null };

    const { data: origem } = await admin
      .from('order_attribution')
      .select('fbclid, landing_page')
      .eq('order_id', orderId)
      .maybeSingle();

    // Só o que a Meta usa para casar a pessoa, e sempre com hash. Nome,
    // endereço e o que mais existir no cadastro ficam de fora: não melhoram o
    // casamento e aumentam a exposição sem motivo.
    const userData: Record<string, unknown> = {};
    const em = await hash(cliente?.email);
    const ph = await hashTelefone(cliente?.phone);
    if (em) userData.em = [em];
    if (ph) userData.ph = [ph];
    if (origem?.fbclid) userData.fbc = origem.fbclid;

    const evento = {
      event_name: 'Purchase',
      event_time: Math.floor(new Date(pedido.created_at).getTime() / 1000),
      // O MESMO id do navegador. É a peça inteira da deduplicação.
      event_id: `purchase_${pedido.id}`,
      action_source: 'website',
      event_source_url: origem?.landing_page
        ? new URL(origem.landing_page, Deno.env.get('APP_ORIGIN') ?? 'https://www.sushiarts.online').toString()
        : (Deno.env.get('APP_ORIGIN') ?? 'https://www.sushiarts.online'),
      user_data: userData,
      custom_data: {
        // O banco guarda centavos; a Meta espera a moeda. Mandar 8499 onde se
        // esperava 84,99 multiplica o faturamento por cem no relatório.
        value: Number((pedido.total_cents / 100).toFixed(2)),
        currency: 'BRL',
        order_id: pedido.code,
        content_type: 'product',
        contents: (pedido.order_items ?? []).map((i: Record<string, number | string>) => ({
          id: i.product_id,
          quantity: i.quantity,
          item_price: Number((Number(i.unit_price_cents) / 100).toFixed(2)),
        })),
        num_items: (pedido.order_items ?? []).reduce(
          (s: number, i: Record<string, number>) => s + Number(i.quantity), 0
        ),
      },
    };

    const resposta = await fetch(`${API}/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [evento] }),
    });

    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      console.error('meta-capi:', resposta.status, JSON.stringify(resultado).slice(0, 300));
      return json({ error: 'Meta recusou o evento.', detalhe: resultado }, 502);
    }

    console.log(`meta-capi: Purchase do pedido ${pedido.code} enviado.`);
    return json({ sent: true, event_id: evento.event_id, meta: resultado });
  } catch (erro) {
    console.error('meta-capi:', erro);
    return json({ error: (erro as Error).message }, 500);
  }
});
