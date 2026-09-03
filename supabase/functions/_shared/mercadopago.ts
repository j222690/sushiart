import { serviceClient } from './utils.ts';

/**
 * De qual conta do Mercado Pago sai a cobrança.
 *
 * Duas origens possíveis, nesta ordem:
 *
 *   1. A conta que o dono do restaurante conectou pelo painel (OAuth). É onde
 *      o dinheiro deve cair.
 *   2. O token de ambiente (`MERCADOPAGO_ACCESS_TOKEN`), que é do
 *      desenvolvedor. Serve para o sistema não parar de vender enquanto a
 *      conexão não é feita — mas o dinheiro cai na conta errada, e por isso o
 *      painel avisa isso em letras grandes.
 *
 * O token do OAuth vence (o Mercado Pago devolve ~180 dias) e é renovado aqui,
 * transparentemente, com uma margem de folga. Renovar só depois de vencer
 * significaria descobrir o problema no meio de uma compra de cliente.
 */

const MP_API = 'https://api.mercadopago.com';

/** Renova com folga: requisição lenta não pode esbarrar num token morrendo. */
const MARGEM_MS = 24 * 60 * 60 * 1000;

export interface ContaMercadoPago {
  token: string;
  /** `true` quando a cobrança sai da conta do restaurante, e não da nossa. */
  doRestaurante: boolean;
}

export async function contaMercadoPago(): Promise<ContaMercadoPago> {
  const admin = serviceClient();

  const { data: conexao } = await admin
    .from('mp_connection')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (!conexao) return { token: tokenDeAmbiente(), doRestaurante: false };

  const vence = new Date(conexao.expires_at).getTime();
  if (vence - MARGEM_MS > Date.now()) {
    return { token: conexao.access_token, doRestaurante: true };
  }

  // Vencendo ou vencido: tenta renovar.
  try {
    const renovado = await renovar(conexao.refresh_token);
    return { token: renovado, doRestaurante: true };
  } catch (erro) {
    console.error('mercadopago: falha ao renovar token', erro);

    // Token vencido de verdade não serve para nada — cair no de ambiente é
    // menos ruim que recusar o pedido do cliente, e o painel já mostra que a
    // conexão precisa ser refeita.
    if (vence < Date.now()) return { token: tokenDeAmbiente(), doRestaurante: false };

    // Ainda dentro da margem: o token atual continua bom por mais um tempo.
    return { token: conexao.access_token, doRestaurante: true };
  }
}

async function renovar(refreshToken: string): Promise<string> {
  const resposta = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('MERCADOPAGO_CLIENT_ID'),
      client_secret: Deno.env.get('MERCADOPAGO_CLIENT_SECRET'),
      refresh_token: refreshToken,
    }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.access_token) {
    throw new Error(dados.message ?? `Renovação recusada (${resposta.status}).`);
  }

  const expiraEm = Number(dados.expires_in) || 60 * 60 * 24 * 180;

  await serviceClient()
    .from('mp_connection')
    .update({
      access_token: dados.access_token,
      // O Mercado Pago devolve um refresh novo a cada renovação. Guardar o
      // antigo faria a próxima renovação falhar — e aí o restaurante perderia
      // a conexão sozinho, meses depois, sem ninguém ter mexido em nada.
      refresh_token: dados.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + expiraEm * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default');

  return dados.access_token;
}

function tokenDeAmbiente(): string {
  const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  if (!token) {
    throw new Error(
      'Mercado Pago não configurado: conecte a conta do restaurante no painel, em Pagamentos.'
    );
  }
  return token;
}
