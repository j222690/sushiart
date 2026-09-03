/**
 * Meta Pixel.
 *
 * Carregado uma vez, sob demanda, e só se `VITE_META_PIXEL_ID` existir — sem a
 * variável o app não baixa nada da Meta. Quem chama é a camada neutra
 * (`analytics/index.js`); nenhuma tela conversa com este arquivo direto.
 *
 * O `fbq` fica na `window` porque é assim que o script da Meta funciona, e a
 * fila (`fbq.queue`) faz os eventos disparados antes do script terminar de
 * baixar não se perderem — é o próprio snippet oficial que resolve isso.
 */

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

let carregado = false;

export function metaConfigurado() {
  return Boolean(PIXEL_ID);
}

export function iniciarMeta() {
  if (!PIXEL_ID || carregado || typeof window === 'undefined') return;
  carregado = true;

  /* eslint-disable */
  // Snippet oficial da Meta, com os nomes de variável dele. Reescrever para
  // ficar bonito é convite para quebrar quando a Meta mudar alguma coisa.
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // `init` sem PageView automático: quem conta página é a camada de rotas, e
  // deixar os dois ligados daria PageView dobrado na primeira tela.
  window.fbq('init', PIXEL_ID);
}

/**
 * Dispara um evento padrão da Meta.
 *
 * `eventID` é o que permite à Meta juntar este disparo com o gêmeo que sai do
 * servidor (Conversions API) e contar UMA conversão em vez de duas.
 */
export function metaTrack(evento, dados = {}, eventID) {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', evento, dados, eventID ? { eventID } : undefined);
}
