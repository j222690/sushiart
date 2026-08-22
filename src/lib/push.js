import { notifications } from './api';

/**
 * Notificações push (Web Push / VAPID).
 *
 * Fluxo: pedir permissão → registrar o service worker → assinar com a chave
 * pública VAPID → guardar a inscrição em `push_tokens`. O envio em si sai do
 * servidor (Edge Function `send-push`), que é onde vive a chave privada.
 *
 * Dois públicos, e a diferença não é cosmética:
 *
 *   'cliente' — avisos do próprio pedido (confirmado, saiu para entrega…)
 *   'equipe'  — avisos da operação (pedido novo, cancelamento)
 *
 * O mesmo navegador pode estar nos dois: o dono acompanha a loja de dia e pede
 * sushi de noite. Por isso a inscrição do navegador é uma só, mas o registro no
 * banco é um por público — e desligar um não desliga o outro.
 *
 * Sem VITE_VAPID_PUBLIC_KEY configurada, a permissão até é pedida (o app já
 * consegue mostrar notificação local com o app aberto), mas nada é gravado —
 * assinar sem chave só geraria um registro inútil no banco.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

/**
 * No iPhone e no iPad, Web Push só funciona com o app instalado na tela de
 * início — numa aba do Safari o navegador aceita a permissão e não entrega
 * nada. Sem detectar isso, a pessoa liga o aviso, não recebe nada e conclui
 * que o app é quebrado.
 */
export function pushPrecisaInstalarNoIos() {
  const ua = navigator.userAgent;
  const ehIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS recente se identifica como Mac; o toque é o que o denuncia.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!ehIos) return false;

  const instalado =
    navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  return !instalado;
}

/**
 * Pega (ou cria) a inscrição deste navegador.
 *
 * Reaproveita a existente de propósito: assinar de novo geraria outro endpoint
 * para o mesmo aparelho e a pessoa receberia a notificação duplicada.
 */
async function getSubscription() {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

/**
 * Ativa o push para um público.
 * `audience` = 'cliente' (padrão) ou 'equipe'.
 */
export async function requestPushPermission(userId, audience = 'cliente') {
  if (!pushSupported()) {
    return { ok: false, reason: 'Seu navegador não suporta notificações push.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? 'Notificações bloqueadas. Libere nas configurações do navegador para este site.'
          : 'Permissão de notificação negada no navegador.',
    };
  }

  if (!VAPID_PUBLIC_KEY) {
    return {
      ok: true,
      reason: 'Permissão concedida. Configure VITE_VAPID_PUBLIC_KEY para receber push com o app fechado.',
    };
  }

  try {
    const subscription = await getSubscription();
    if (userId) {
      await notifications.saveToken(userId, JSON.stringify(subscription), 'web', audience);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || 'Não foi possível ativar as notificações.' };
  }
}

/**
 * Desliga o push de UM público neste aparelho.
 *
 * Só apaga a linha do banco — a inscrição do navegador continua de pé, porque
 * ela pode estar servindo o outro público. Cancelar a inscrição aqui derrubaria
 * os avisos de cliente junto com os da equipe.
 */
export async function disablePush(audience = 'cliente') {
  if (!pushSupported()) return { ok: false, reason: 'Sem suporte a push.' };

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    await notifications.removeToken(JSON.stringify(subscription), audience);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || 'Não foi possível desligar.' };
  }
}

/** Este aparelho já está registrado para receber avisos deste público? */
export async function isPushEnabled(userId, audience = 'cliente') {
  if (!pushSupported() || !VAPID_PUBLIC_KEY || !userId) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    return notifications.hasToken(userId, JSON.stringify(subscription), audience);
  } catch {
    return false;
  }
}

/**
 * Regrava a inscrição deste aparelho no banco, sem pedir permissão nenhuma.
 *
 * Existe por um motivo específico: o endpoint de push NÃO é estável. O
 * navegador pode rotacioná-lo sozinho (atualização, limpeza interna, troca de
 * conta do Chrome). Quando isso acontece, a linha em `push_tokens` aponta para
 * um endereço morto e a pessoa simplesmente para de receber aviso — sem erro,
 * sem sinal, sem jeito de desconfiar.
 *
 * Rodando no carregamento do app, a linha nova entra antes de fazer falta. A
 * antiga é apagada pelo `send-push` no primeiro 410 que o push service devolver.
 *
 * Silencioso de propósito: é manutenção, não ação do usuário. Se falhar, o
 * único efeito é continuar com o registro antigo — que é o estado de hoje.
 */
export async function sincronizarInscricao(userId, audience = 'cliente') {
  if (!pushSupported() || !VAPID_PUBLIC_KEY || !userId) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    const token = JSON.stringify(subscription);
    if (await notifications.hasToken(userId, token, audience)) return false;

    await notifications.saveToken(userId, token, 'web', audience);
    return true;
  } catch {
    return false;
  }
}

/** Notificação local — útil para avisar de mudança de status com o app aberto. */
export function notifyLocal(title, body, data = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/logo.svg', badge: '/logo.svg', data });
}
