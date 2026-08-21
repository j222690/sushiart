import { corsHeaders, json, requireEnv, serviceClient, userClient } from '../_shared/utils.ts';

/**
 * Roteador de pagamento.
 *
 * O app manda só o `order_id`. Esta função:
 *   1. confirma que o pedido é de quem está chamando (não dá para pagar/ler
 *      o pedido de outra pessoa passando um id qualquer);
 *   2. lê em `payment_config` qual provedor atende aquele método;
 *   3. chama o adapter certo com o valor lido do BANCO, nunca do cliente;
 *   4. guarda a referência da cobrança no pedido.
 *
 * Trocar de gateway no futuro = novo adapter aqui + mudar o `provider` no
 * painel. O app do cliente não muda.
 */

/**
 * Provedores já escolhidos pelo restaurante mas ainda sem adapter escrito.
 * Mantido em sincronia com `implemented: false` em src/lib/constants.js.
 * Ao escrever o adapter, remova o nome daqui.
 *
 * Hoje está vazio — InfinitePay, Asaas, Mercado Pago e PagBank têm adapter.
 * O mecanismo fica de pé para o próximo gateway que entrar: é melhor o painel
 * recusar ativar um método sem integração do que o cliente descobrir isso na
 * tela de pagamento.
 */
const PENDING_PROVIDERS = new Set<string>([]);

type Charge = {
  provider: string;
  reference: string;
  checkout_url: string | null;
  pix_code?: string | null;
  qr_code_base64?: string | null;
  expires_at?: string | null;
  payload?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// InfinitePay — Pix (Checkout Integrado)
// Docs: POST https://api.checkout.infinitepay.io/links
// ---------------------------------------------------------------------------
async function createInfinitePayCharge(order: any, appOrigin: string): Promise<Charge> {
  const handle = requireEnv('INFINITEPAY_HANDLE');
  const supabaseUrl = requireEnv('SUPABASE_URL');

  const body = {
    handle,
    order_nsu: order.id, // nossa referência: volta no webhook como order_nsu
    redirect_url: `${appOrigin}/pedidos/${order.id}`,
    // A InfinitePay usa webhook dinâmico por cobrança — não há URL fixa no painel.
    webhook_url: `${supabaseUrl}/functions/v1/webhook-infinitepay`,
    items: [
      {
        quantity: 1,
        // Preço SEMPRE em centavos, e sempre o total que está no banco.
        price: order.total_cents,
        description: `Pedido ${order.code} — Sushi Art`,
      },
    ],
    ...(order.customer_name
      ? {
          customer: {
            name: String(order.customer_name).slice(0, 100),
            email: order.customer_email ?? undefined,
            phone_number: order.customer_phone ? `+55${order.customer_phone}` : undefined,
          },
        }
      : {}),
  };

  const response = await fetch('https://api.checkout.infinitepay.io/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.url) {
    throw new Error(
      `InfinitePay recusou a cobrança (HTTP ${response.status}): ${
        data?.message ?? JSON.stringify(data).slice(0, 200)
      }`
    );
  }

  return {
    provider: 'infinitepay',
    reference: String(order.id),
    checkout_url: data.url,
    payload: { infinitepay: data },
  };
}

// ---------------------------------------------------------------------------
// Asaas — cartão de crédito
// Docs: POST https://api.asaas.com/v3/payments (header `access_token`)
// ---------------------------------------------------------------------------
function asaasBase() {
  return Deno.env.get('ASAAS_ENV') === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${asaasBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: requireEnv('ASAAS_API_KEY'),
      ...(init.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.description ?? JSON.stringify(data).slice(0, 200);
    throw new Error(`Asaas (HTTP ${response.status}): ${detail}`);
  }
  return data;
}

/** Reaproveita o cliente do Asaas pelo e-mail; cria se ainda não existir. */
async function ensureAsaasCustomer(order: any) {
  const email = order.customer_email;
  if (email) {
    const found = await asaasFetch(`/customers?email=${encodeURIComponent(email)}`);
    if (found?.data?.length) return found.data[0].id;
  }

  const created = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: order.customer_name || 'Cliente Sushi Art',
      email: email ?? undefined,
      mobilePhone: order.customer_phone ?? undefined,
      externalReference: order.customer_id,
      // cpfCnpj é exigido em produção pelo Asaas. Se o restaurante ligar a
      // exigência de CPF, colete no checkout e envie aqui.
      cpfCnpj: order.customer_document ?? undefined,
    }),
  });

  return created.id;
}

async function createAsaasCharge(order: any, appOrigin: string): Promise<Charge> {
  const customerId = await ensureAsaasCustomer(order);

  // Vence hoje: é pagamento imediato no checkout, não um boleto futuro.
  const dueDate = new Date().toISOString().slice(0, 10);

  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'CREDIT_CARD',
      value: order.total_cents / 100, // Asaas trabalha em reais decimais
      dueDate,
      description: `Pedido ${order.code} — Sushi Art`,
      externalReference: order.id,
      ...(order.installments > 1
        ? { installmentCount: order.installments, totalValue: order.total_cents / 100 }
        : {}),
      callback: { successUrl: `${appOrigin}/pedidos/${order.id}`, autoRedirect: true },
    }),
  });

  return {
    provider: 'asaas',
    reference: payment.id,
    // invoiceUrl é o checkout hospedado do Asaas: o cartão é digitado lá,
    // então o número do cartão nunca passa pelo nosso servidor.
    checkout_url: payment.invoiceUrl,
    expires_at: null,
    payload: { asaas: { id: payment.id, status: payment.status } },
  };
}

/** Pix pelo Asaas — usado se o restaurante trocar o provedor do Pix no painel. */
async function createAsaasPix(order: any): Promise<Charge> {
  const customerId = await ensureAsaasCustomer(order);

  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value: order.total_cents / 100,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `Pedido ${order.code} — Sushi Art`,
      externalReference: order.id,
    }),
  });

  const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`);

  return {
    provider: 'asaas',
    reference: payment.id,
    checkout_url: payment.invoiceUrl,
    pix_code: qr.payload,
    qr_code_base64: qr.encodedImage,
    expires_at: qr.expirationDate ?? null,
    payload: { asaas: { id: payment.id, status: payment.status } },
  };
}

// ---------------------------------------------------------------------------
// Mercado Pago — cartão de crédito (Checkout Pro) e Pix
// Docs: POST https://api.mercadopago.com/checkout/preferences
//       POST https://api.mercadopago.com/v1/payments
// ---------------------------------------------------------------------------
async function mercadoPagoFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireEnv('MERCADOPAGO_ACCESS_TOKEN')}`,
      ...(init.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.message ?? data?.cause?.[0]?.description ?? JSON.stringify(data).slice(0, 200);
    throw new Error(`Mercado Pago (HTTP ${response.status}): ${detail}`);
  }
  return data;
}

/**
 * Checkout Pro: o cliente digita o cartão na tela do Mercado Pago.
 *
 * Escolhido em vez da API de cartão direta por um motivo prático: assim o
 * número do cartão nunca toca o nosso servidor, e não herdamos escopo de PCI
 * nem a obrigação de fazer 3DS na mão.
 */
async function createMercadoPagoCheckout(order: any, appOrigin: string): Promise<Charge> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const backUrl = `${appOrigin}/pedidos/${order.id}`;

  const preference = await mercadoPagoFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        {
          id: order.id,
          title: `Pedido ${order.code} — Sushi Art`,
          quantity: 1,
          currency_id: 'BRL',
          // O MP trabalha em reais decimais; o nosso banco, em centavos.
          unit_price: order.total_cents / 100,
        },
      ],
      // Volta no webhook e é como achamos o pedido de novo.
      external_reference: order.id,
      notification_url: `${supabaseUrl}/functions/v1/webhook-mercadopago`,
      back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
      auto_return: 'approved',
      // Este checkout é só do cartão de crédito: Pix e boleto têm caminho
      // próprio no app, e deixá-los aqui bagunçaria o roteamento do painel.
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }],
        installments: order.installments > 1 ? order.installments : 1,
      },
      ...(order.customer_email
        ? {
            payer: {
              name: order.customer_name ?? undefined,
              email: order.customer_email,
            },
          }
        : {}),
    }),
  });

  return {
    provider: 'mercadopago',
    reference: String(preference.id),
    // sandbox_init_point só existe com credencial de teste — usar quando vier.
    checkout_url: preference.sandbox_init_point ?? preference.init_point,
    payload: { mercadopago: { preference_id: preference.id } },
  };
}

/** Pix pelo Mercado Pago — usado se o painel apontar o Pix para cá. */
async function createMercadoPagoPix(order: any): Promise<Charge> {
  const supabaseUrl = requireEnv('SUPABASE_URL');

  const payment = await mercadoPagoFetch('/v1/payments', {
    method: 'POST',
    headers: {
      // Recriar a cobrança do mesmo pedido não gera dois Pix.
      'X-Idempotency-Key': `pix-${order.id}`,
    },
    body: JSON.stringify({
      transaction_amount: order.total_cents / 100,
      payment_method_id: 'pix',
      description: `Pedido ${order.code} — Sushi Art`,
      external_reference: order.id,
      notification_url: `${supabaseUrl}/functions/v1/webhook-mercadopago`,
      payer: {
        email: order.customer_email ?? 'cliente@sushiart.com.br',
        first_name: order.customer_name ?? undefined,
      },
    }),
  });

  const pix = payment?.point_of_interaction?.transaction_data ?? {};

  return {
    provider: 'mercadopago',
    reference: String(payment.id),
    checkout_url: pix.ticket_url ?? null,
    pix_code: pix.qr_code ?? null,
    qr_code_base64: pix.qr_code_base64 ?? null,
    expires_at: payment.date_of_expiration ?? null,
    payload: { mercadopago: { id: payment.id, status: payment.status } },
  };
}

// ---------------------------------------------------------------------------
// PagBank — cartão de débito (Checkout hospedado) e Pix
// Docs: POST {base}/checkouts  ·  POST {base}/orders
// ---------------------------------------------------------------------------
function pagBankBase() {
  return Deno.env.get('PAGBANK_ENV') === 'production'
    ? 'https://api.pagseguro.com'
    : 'https://sandbox.api.pagseguro.com';
}

async function pagBankFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${pagBankBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${requireEnv('PAGBANK_TOKEN')}`,
      ...(init.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.error_messages?.[0]?.description ??
      data?.message ??
      JSON.stringify(data).slice(0, 200);
    throw new Error(`PagBank (HTTP ${response.status}): ${detail}`);
  }
  return data;
}

/** Telefone do cadastro (só dígitos) no formato que o PagBank espera. */
function pagBankPhone(phone: string | null) {
  const digits = String(phone ?? '').replace(/\D/g, '').slice(-11);
  if (digits.length < 10) return undefined;
  return [{ country: '55', area: digits.slice(0, 2), number: digits.slice(2), type: 'MOBILE' }];
}

/**
 * Checkout PagBank: página hospedada por eles.
 *
 * É o caminho para DÉBITO. Débito online exige 3DS, e a tela do PagBank já faz
 * a autenticação com o banco emissor — fazer isso na mão significaria embutir
 * o SDK 3DS deles no nosso checkout e guardar dado de cartão no caminho.
 */
async function createPagBankCheckout(order: any, appOrigin: string): Promise<Charge> {
  const supabaseUrl = requireEnv('SUPABASE_URL');

  const tipo = order.payment_method === 'cartao_debito' ? 'DEBIT_CARD' : 'CREDIT_CARD';

  const checkout = await pagBankFetch('/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      reference_id: order.id,
      customer: {
        name: order.customer_name || 'Cliente Sushi Art',
        email: order.customer_email ?? undefined,
        // O PagBank exige CPF em produção. Se o restaurante ligar a coleta de
        // CPF no checkout, o valor cai aqui automaticamente.
        tax_id: order.customer_document ?? undefined,
        phones: pagBankPhone(order.customer_phone),
      },
      items: [
        {
          reference_id: order.id,
          name: `Pedido ${order.code} — Sushi Art`,
          quantity: 1,
          unit_amount: order.total_cents, // PagBank trabalha em centavos
        },
      ],
      payment_methods: [{ type: tipo }],
      redirect_url: `${appOrigin}/pedidos/${order.id}`,
      notification_urls: [`${supabaseUrl}/functions/v1/webhook-pagbank`],
    }),
  });

  const pagar = (checkout.links ?? []).find((link: any) => link.rel === 'PAY');
  if (!pagar?.href) {
    throw new Error('PagBank não devolveu o link de pagamento (rel PAY).');
  }

  return {
    provider: 'pagbank',
    reference: String(checkout.id),
    checkout_url: pagar.href,
    expires_at: checkout.expiration_date ?? null,
    payload: { pagbank: { checkout_id: checkout.id, status: checkout.status } },
  };
}

/** Pix pelo PagBank — usado se o painel apontar o Pix para cá. */
async function createPagBankPix(order: any): Promise<Charge> {
  const supabaseUrl = requireEnv('SUPABASE_URL');

  // Pix de pedido não fica de pé o dia inteiro: 30 minutos é folgado para
  // pagar e curto o bastante para não segurar estoque à toa.
  const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const pedido = await pagBankFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      reference_id: order.id,
      customer: {
        name: order.customer_name || 'Cliente Sushi Art',
        email: order.customer_email ?? undefined,
        tax_id: order.customer_document ?? undefined,
        phones: pagBankPhone(order.customer_phone),
      },
      items: [
        {
          name: `Pedido ${order.code} — Sushi Art`,
          quantity: 1,
          unit_amount: order.total_cents,
        },
      ],
      qr_codes: [{ amount: { value: order.total_cents }, expiration_date: expiration }],
      notification_urls: [`${supabaseUrl}/functions/v1/webhook-pagbank`],
    }),
  });

  const qr = pedido.qr_codes?.[0];
  if (!qr?.text) throw new Error('PagBank não devolveu o QR Code do Pix.');

  const links = qr.links ?? [];
  const png = links.find((link: any) => link.rel === 'QRCODE.PNG');
  const base64Link = links.find((link: any) => link.rel === 'QRCODE.BASE64');

  // O PagBank entrega o QR como link, não embutido na resposta. Buscamos o
  // base64 aqui para o cliente ver a imagem — igual aos outros gateways. Se
  // falhar, o Pix copia e cola sozinho já fecha o pagamento, então não é
  // motivo para derrubar a cobrança inteira.
  let qrBase64: string | null = null;
  if (base64Link?.href) {
    try {
      const resposta = await fetch(base64Link.href, {
        headers: { Authorization: `Bearer ${requireEnv('PAGBANK_TOKEN')}` },
      });
      if (resposta.ok) qrBase64 = (await resposta.text()).trim() || null;
    } catch (error) {
      console.warn('PagBank: não foi possível buscar o QR em base64:', error);
    }
  }

  return {
    provider: 'pagbank',
    reference: String(pedido.id),
    checkout_url: png?.href ?? null,
    pix_code: qr.text,
    qr_code_base64: qrBase64,
    expires_at: qr.expiration_date ?? expiration,
    payload: { pagbank: { order_id: pedido.id, qr_code_id: qr.id } },
  };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const { order_id: orderId } = await req.json();
    if (!orderId) return json({ error: 'Pedido não informado.' }, 400);

    // Lê o pedido COMO o usuário: a RLS garante que ele só enxerga o próprio.
    const asUser = userClient(authHeader);
    const { data: auth } = await asUser.auth.getUser();
    if (!auth?.user) return json({ error: 'Sessão inválida.' }, 401);

    const { data: order, error } = await asUser
      .from('orders')
      .select('*, customers(name, email, phone)')
      .eq('id', orderId)
      .single();

    if (error || !order) return json({ error: 'Pedido não encontrado.' }, 404);
    if (order.customer_id !== auth.user.id) return json({ error: 'Pedido de outro cliente.' }, 403);
    if (order.payment_status === 'pago') return json({ error: 'Este pedido já foi pago.' }, 409);
    if (order.payment_method === 'na_entrega') {
      return json({ error: 'Pedido pago na entrega não gera cobrança online.' }, 400);
    }

    const admin = serviceClient();

    // Qual provedor atende este método agora (o painel pode ter mudado).
    const { data: config } = await admin
      .from('payment_config')
      .select('*')
      .eq('method', order.payment_method)
      .eq('is_active', true)
      .single();

    if (!config) return json({ error: 'Forma de pagamento indisponível.' }, 400);

    const appOrigin = Deno.env.get('APP_ORIGIN') ?? new URL(req.url).origin;
    const enriched = {
      ...order,
      customer_name: order.customers?.name,
      customer_email: order.customers?.email,
      customer_phone: order.customers?.phone,
    };

    let charge: Charge;
    if (config.provider === 'infinitepay') {
      charge = await createInfinitePayCharge(enriched, appOrigin);
    } else if (config.provider === 'asaas') {
      charge =
        order.payment_method === 'pix'
          ? await createAsaasPix(enriched)
          : await createAsaasCharge(enriched, appOrigin);
    } else if (config.provider === 'mercadopago') {
      charge =
        order.payment_method === 'pix'
          ? await createMercadoPagoPix(enriched)
          : await createMercadoPagoCheckout(enriched, appOrigin);
    } else if (config.provider === 'pagbank') {
      charge =
        order.payment_method === 'pix'
          ? await createPagBankPix(enriched)
          : await createPagBankCheckout(enriched, appOrigin);
    } else if (PENDING_PROVIDERS.has(config.provider)) {
      // Roteado no painel, mas sem adapter escrito. Mensagem explícita para o
      // suporte saber exatamente o que falta, em vez de um 500 genérico.
      console.error(`Adapter ausente: ${config.provider} (${order.payment_method})`);
      return json(
        {
          error:
            `A integração com ${config.provider} ainda não foi implementada. ` +
            'Desative esta forma de pagamento no painel ou escolha outro gateway.',
        },
        501
      );
    } else {
      return json({ error: `Provedor não suportado: ${config.provider}` }, 400);
    }

    // Guarda a referência para o webhook conseguir casar com o pedido.
    await admin.rpc('attach_payment_details', {
      p_order_id: order.id,
      p_provider: charge.provider,
      p_reference: charge.reference,
      p_url: charge.checkout_url,
      p_payload: {
        ...(charge.payload ?? {}),
        pix_code: charge.pix_code ?? null,
        qr_code_base64: charge.qr_code_base64 ?? null,
        expires_at: charge.expires_at ?? null,
      },
    });

    return json({
      provider: charge.provider,
      checkout_url: charge.checkout_url,
      pix_code: charge.pix_code ?? null,
      qr_code_base64: charge.qr_code_base64 ?? null,
      expires_at: charge.expires_at ?? null,
    });
  } catch (error) {
    console.error('create-payment:', error);
    return json({ error: (error as Error).message ?? 'Falha ao criar a cobrança.' }, 500);
  }
});
