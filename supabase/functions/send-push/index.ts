import { corsHeaders, json, requireEnv, safeEqual, serviceClient, userClient } from '../_shared/utils.ts';
import { sendWebPush, type PushSubscription } from '../_shared/webpush.ts';

/**
 * Entrega das notificações push.
 *
 * Quem chama esta função é o BANCO, não o navegador. Toda vez que uma linha
 * entra em `notifications`, um trigger dispara um POST daqui com o id da linha
 * (veja `0007_push.sql`). Isso importa por dois motivos:
 *
 *   1. o aviso sai mesmo que o cliente feche o app no segundo seguinte ao
 *      pedido — nada depende de uma aba aberta;
 *   2. existe um caminho só para o push: quem muda o status é sempre uma RPC,
 *      e toda RPC já grava em `notifications`. Não há como avisar o cliente e
 *      esquecer de avisar a cozinha.
 *
 * Dois públicos:
 *   audience = 'cliente' → dono do pedido (ou todos, quando customer_id é null)
 *   audience = 'equipe'  → todo aparelho que a equipe registrou no painel
 */

type NotificationRow = {
  id: string;
  customer_id: string | null;
  audience: 'cliente' | 'equipe';
  // Propaganda só sai para quem aceitou; aviso de pedido vai sempre.
  kind: 'transacional' | 'marketing';
  title: string;
  body: string;
  data: Record<string, unknown>;
};

/** Cada aparelho guarda a inscrição inteira como JSON na coluna `token`. */
function parseSubscription(token: string): PushSubscription | null {
  try {
    const parsed = JSON.parse(token);
    if (!parsed?.endpoint || !parsed?.keys?.p256dh || !parsed?.keys?.auth) return null;
    return parsed as PushSubscription;
  } catch {
    return null;
  }
}

async function deliver(
  admin: ReturnType<typeof serviceClient>,
  rows: { id: string; token: string }[],
  payload: unknown
) {
  const vapid = {
    publicKey: requireEnv('VAPID_PUBLIC_KEY'),
    privateKey: requireEnv('VAPID_PRIVATE_KEY'),
    // O RFC pede um contato para o push service falar com o dono do serviço.
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@sushiart.com.br',
  };

  const dead: string[] = [];
  let sent = 0;
  let failed = 0;

  // Em paralelo: um aparelho lento não pode atrasar o aviso dos outros.
  const results = await Promise.all(
    rows.map(async (row) => {
      const subscription = parseSubscription(row.token);
      if (!subscription) return { id: row.id, gone: true, ok: false };

      const result = await sendWebPush(subscription, payload, vapid);
      if (!result.ok && !result.gone) {
        console.error(`push falhou (${result.status}): ${result.error ?? ''}`);
      }
      return { id: row.id, gone: result.gone, ok: result.ok };
    })
  );

  for (const result of results) {
    if (result.ok) sent += 1;
    else failed += 1;
    if (result.gone) dead.push(result.id);
  }

  // Inscrição que o navegador descartou some do banco — senão a tabela vira um
  // cemitério e todo envio futuro gasta tempo batendo em endpoint morto.
  if (dead.length) {
    await admin.from('push_tokens').delete().in('id', dead);
    console.log(`push_tokens: ${dead.length} inscrição(ões) expirada(s) removida(s).`);
  }

  return { sent, failed, removed: dead.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const admin = serviceClient();
    const payload = await req.json().catch(() => ({}));

    // ---------------------------------------------------------------------
    // Caminho 1 — teste manual pelo painel ("enviar notificação de teste").
    // Autenticado como a pessoa; manda só para os aparelhos dela.
    // ---------------------------------------------------------------------
    if (payload.test) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

      const { data: auth } = await userClient(authHeader).auth.getUser();
      if (!auth?.user) return json({ error: 'Sessão inválida.' }, 401);

      const audience = payload.audience === 'equipe' ? 'equipe' : 'cliente';

      const { data: tokens } = await admin
        .from('push_tokens')
        .select('id, token')
        .eq('customer_id', auth.user.id)
        .eq('audience', audience);

      if (!tokens?.length) {
        return json({ error: 'Nenhum aparelho registrado para este acesso.' }, 404);
      }

      const result = await deliver(admin, tokens, {
        title: 'Sushi Art',
        body:
          audience === 'equipe'
            ? 'Teste do painel: os avisos de pedido novo vão chegar assim.'
            : 'Teste: é assim que os avisos do seu pedido vão chegar.',
        tag: 'teste',
        // O caminho do painel vem do ambiente: não é mais `/admin` fixo.
        // Errado aqui, a equipe toca no aviso de pedido novo e cai numa
        // página que não existe — no meio do movimento.
        data: {
          url:
            audience === 'equipe'
              ? `/${Deno.env.get('ADMIN_PATH') ?? 'admin'}/pedidos`
              : '/pedidos',
        },
      });

      return json(result);
    }

    // ---------------------------------------------------------------------
    // Caminho 2 — disparo do banco. Só o trigger conhece este segredo.
    // ---------------------------------------------------------------------
    const expected = Deno.env.get('PUSH_HOOK_SECRET');
    if (!expected) {
      console.error('PUSH_HOOK_SECRET não configurado — recusando disparo.');
      return json({ error: 'Push não configurado.' }, 500);
    }
    if (!safeEqual(req.headers.get('x-push-secret') ?? '', expected)) {
      console.warn('send-push: segredo inválido.');
      return json({ error: 'Não autorizado.' }, 401);
    }

    const notificationId = payload.notification_id;
    if (!notificationId) return json({ error: 'notification_id ausente.' }, 400);

    const { data } = await admin
      .from('notifications')
      .select('id, customer_id, audience, kind, title, body, data')
      .eq('id', notificationId)
      .single();

    if (!data) return json({ error: 'Notificação não encontrada.' }, 404);
    const notification = data as NotificationRow;

    // Monta a lista de aparelhos conforme o público da notificação.
    let query = admin.from('push_tokens').select('id, token').eq('audience', notification.audience);

    if (notification.audience === 'cliente' && notification.customer_id) {
      query = query.eq('customer_id', notification.customer_id);
    }
    // audience 'equipe' → todos os aparelhos da equipe.
    // audience 'cliente' + customer_id null → broadcast para toda a base.

    let { data: tokens } = await query;

    // ---------------------------------------------------------------------
    // Propaganda só para quem aceitou.
    //
    // O aviso do próprio pedido a pessoa pediu ao comprar, e vai sempre. Já
    // "hot roll com 20% hoje" é propaganda: quem desligou "avisos de ofertas"
    // no perfil não pode receber.
    //
    // Antes desta trava o interruptor existia na tela e não fazia nada — a
    // campanha ia para todo mundo com o app instalado. Mandar promoção para
    // quem disse não é o caminho mais curto para a desinstalação.
    //
    // O filtro é feito aqui, e não numa consulta só, porque `push_tokens` não
    // guarda a preferência: ela vive em `customers`.
    // ---------------------------------------------------------------------
    if (notification.kind === 'marketing' && tokens?.length) {
      const { data: aceitam } = await admin
        .from('customers')
        .select('id')
        .eq('marketing_opt_in', true);

      const permitidos = new Set((aceitam ?? []).map((c: { id: string }) => c.id));

      const { data: donos } = await admin
        .from('push_tokens')
        .select('id, customer_id')
        .in('id', tokens.map((t) => t.id));

      const idsPermitidos = new Set(
        (donos ?? [])
          .filter((d: { customer_id: string }) => permitidos.has(d.customer_id))
          .map((d: { id: string }) => d.id)
      );

      tokens = tokens.filter((t) => idsPermitidos.has(t.id));

      if (!tokens.length) {
        return json({ sent: 0, failed: 0, removed: 0, reason: 'ninguém aceitou marketing' });
      }
    }

    if (!tokens?.length) {
      return json({ sent: 0, failed: 0, removed: 0, reason: 'nenhum aparelho registrado' });
    }

    const result = await deliver(admin, tokens, {
      title: notification.title,
      body: notification.body,
      // `tag` agrupa: um aviso novo do mesmo pedido substitui o anterior na
      // bandeja em vez de empilhar cinco cards do mesmo pedido.
      tag: notification.data?.order_id ? `pedido-${notification.data.order_id}` : notification.id,
      data: { ...notification.data, audience: notification.audience },
    });

    console.log(
      `send-push ${notification.audience} "${notification.title}": ` +
        `${result.sent} enviada(s), ${result.failed} falha(s).`
    );

    return json(result);
  } catch (error) {
    console.error('send-push:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
