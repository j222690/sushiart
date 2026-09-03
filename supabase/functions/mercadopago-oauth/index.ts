import { corsHeaders, json, requireEnv, serviceClient, userClient } from '../_shared/utils.ts';

/**
 * Conexão da conta do Mercado Pago do restaurante, via OAuth.
 *
 * O que muda na prática: hoje as cobranças usam o token do desenvolvedor, e o
 * dinheiro cai na conta dele. Depois que o dono do restaurante passa por aqui,
 * as cobranças passam a usar o token DELE, e o dinheiro cai na conta dele.
 *
 * Dois caminhos, na mesma função porque `verify_jwt` é por função e não por
 * rota — e os dois têm exigências opostas:
 *
 *   POST /start     — só admin. Devolve o link do Mercado Pago para autorizar.
 *   GET  /callback  — SEM login nenhum. Quem chega aqui é o navegador do dono
 *                     redirecionado pelo Mercado Pago, que obviamente não
 *                     carrega o nosso JWT.
 *
 * Por isso a função inteira roda com `verify_jwt = false` e cada caminho
 * confere o que lhe cabe: `/start` confere que quem pediu é admin de verdade,
 * `/callback` confere o `state` — o bilhete de uso único que prova que aquele
 * retorno corresponde a um pedido de conexão que este painel iniciou.
 *
 * Sem essa conferência de `state`, alguém consegue fazer o admin clicar num
 * link preparado e conectar a conta do ATACANTE ao restaurante. A partir dali,
 * todo pagamento cairia na conta de quem preparou o link — e o painel diria
 * "conectado", porque para ele estaria mesmo.
 */

const MP_AUTH = 'https://auth.mercadopago.com.br/authorization';
const MP_API = 'https://api.mercadopago.com';

/** Para onde o dono volta depois de autorizar (ou de dar errado). */
function paginaDoPainel(status: string, mensagem?: string): string {
  const base = Deno.env.get('APP_ORIGIN') ?? 'https://www.sushiarts.online';
  const url = new URL('/admin/pagamentos', base);
  url.searchParams.set('mp', status);
  if (mensagem) url.searchParams.set('mensagem', mensagem);
  return url.toString();
}

function redireciona(destino: string): Response {
  return new Response(null, { status: 302, headers: { Location: destino } });
}

/**
 * O endereço de retorno registrado no painel do Mercado Pago.
 *
 * Precisa bater CARACTERE POR CARACTERE com o que está cadastrado lá, senão o
 * Mercado Pago recusa antes mesmo de mostrar a tela de autorização. Por isso é
 * variável de ambiente e não montado a partir da requisição: montar dinâmico
 * daria uma URL diferente por origem e quebraria em produção sem avisar.
 */
function redirectUri(): string {
  return requireEnv('MERCADOPAGO_REDIRECT_URI');
}

// ---------------------------------------------------------------------------
// POST /start
// ---------------------------------------------------------------------------
async function iniciar(req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'Não autorizado.' }, 401);

  // Confere no banco que quem chamou é admin. Não dá para confiar no app: esta
  // função devolve um link que, seguido, redireciona o dinheiro do restaurante.
  const como = userClient(auth);
  const { data: usuario } = await como.auth.getUser();
  if (!usuario?.user) return json({ error: 'Não autorizado.' }, 401);

  const { data: ehAdmin, error: erroAdmin } = await como.rpc('is_admin');
  if (erroAdmin || !ehAdmin) return json({ error: 'Apenas administradores.' }, 403);

  const admin = serviceClient();
  await admin.rpc('mp_limpar_states');

  const state = crypto.randomUUID();
  const { error } = await admin
    .from('mp_oauth_states')
    .insert({ state, created_by: usuario.user.id });

  if (error) {
    console.error('mercadopago-oauth: falha ao gravar state', error);
    return json({ error: 'Não foi possível iniciar a conexão.' }, 500);
  }

  const url = new URL(MP_AUTH);
  url.searchParams.set('client_id', requireEnv('MERCADOPAGO_CLIENT_ID'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);

  return json({ url: url.toString() });
}

// ---------------------------------------------------------------------------
// GET /callback
// ---------------------------------------------------------------------------
async function retorno(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;

  const negado = params.get('error');
  if (negado) {
    return redireciona(
      paginaDoPainel('erro', `O Mercado Pago não autorizou (${negado}).`)
    );
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return redireciona(paginaDoPainel('erro', 'Retorno incompleto do Mercado Pago.'));
  }

  const admin = serviceClient();

  // O state precisa existir, não ter sido usado e não ter vencido. Marcamos
  // como usado ANTES de trocar o código: se a troca falhar, o dono clica em
  // conectar de novo e ganha um state novo. Reaproveitar o mesmo é o que abre
  // a porta para replay.
  const { data: guardado } = await admin
    .from('mp_oauth_states')
    .select('state, used_at, expires_at')
    .eq('state', state)
    .maybeSingle();

  if (!guardado || guardado.used_at || new Date(guardado.expires_at) < new Date()) {
    return redireciona(
      paginaDoPainel('erro', 'Sessão de conexão inválida ou expirada. Tente conectar de novo.')
    );
  }

  await admin
    .from('mp_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', state);

  // -------------------------------------------------------------------------
  // Troca do código pelos tokens
  // -------------------------------------------------------------------------
  try {
    const resposta = await fetch(`${MP_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: requireEnv('MERCADOPAGO_CLIENT_ID'),
        client_secret: requireEnv('MERCADOPAGO_CLIENT_SECRET'),
        code,
        redirect_uri: redirectUri(),
      }),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok || !dados.access_token || !dados.refresh_token) {
      console.error('mercadopago-oauth: troca falhou', resposta.status, dados);
      return redireciona(
        paginaDoPainel('erro', dados.message ?? 'O Mercado Pago recusou a autorização.')
      );
    }

    // Quem foi que autorizou. Serve para o painel dizer "conectado como
    // Fulano" — e para o dono perceber na hora se conectou a conta errada,
    // que é um erro caro e silencioso.
    let apelido: string | null = null;
    let email: string | null = null;
    try {
      const quem = await fetch(`${MP_API}/users/me`, {
        headers: { Authorization: `Bearer ${dados.access_token}` },
      });
      if (quem.ok) {
        const perfil = await quem.json();
        apelido = perfil.nickname ?? null;
        email = perfil.email ?? null;
      }
    } catch {
      // Não é motivo para recusar a conexão: os tokens já são válidos, e o
      // nome é enfeite de tela.
    }

    const expiraEm = Number(dados.expires_in) || 60 * 60 * 24 * 180;

    const { error } = await admin.from('mp_connection').upsert({
      id: 'default',
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      public_key: dados.public_key ?? null,
      mp_user_id: dados.user_id ?? null,
      nickname: apelido,
      email,
      expires_at: new Date(Date.now() + expiraEm * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('mercadopago-oauth: falha ao gravar conexão', error);
      return redireciona(paginaDoPainel('erro', 'Não foi possível salvar a conexão.'));
    }

    console.log(`Mercado Pago conectado: ${apelido ?? dados.user_id}`);
    return redireciona(paginaDoPainel('conectado'));
  } catch (erro) {
    console.error('mercadopago-oauth:', erro);
    return redireciona(paginaDoPainel('erro', (erro as Error).message));
  }
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caminho = new URL(req.url).pathname;

  try {
    if (caminho.endsWith('/start') && req.method === 'POST') return await iniciar(req);
    if (caminho.endsWith('/callback')) return await retorno(req);
    return json({ error: 'Rota não encontrada.' }, 404);
  } catch (erro) {
    console.error('mercadopago-oauth:', erro);
    return json({ error: (erro as Error).message }, 500);
  }
});
