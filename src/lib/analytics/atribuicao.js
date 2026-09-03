/**
 * De onde veio o cliente.
 *
 * Guarda os parâmetros de campanha da URL (`utm_*`, `fbclid`, `gclid`) para que
 * o pedido possa ser creditado à campanha certa lá na frente. Sem isso, o
 * anúncio traz gente, a venda acontece e ninguém sabe qual criativo pagou por
 * ela — que é a pergunta que decide onde colocar a verba.
 *
 * DUAS MEMÓRIAS, DE PROPÓSITO
 *
 *   primeiro toque  — quem apresentou o restaurante. Nunca é sobrescrito.
 *   último toque    — o que trouxe a pessoa desta vez.
 *
 * A diferença importa: quem descobre a casa por um vídeo e compra semanas
 * depois vindo de um anúncio de remarketing gera uma venda que os dois
 * ajudaram a fazer. Guardar só o último apaga o vídeo do mapa e leva o
 * restaurante a cortar justamente o que traz gente nova.
 *
 * ONDE MORA
 *
 * `localStorage`, não `sessionStorage`: a jornada de um delivery atravessa
 * dias — a pessoa vê o anúncio na segunda e pede na sexta. Em `sessionStorage`
 * essa ligação morreria ao fechar a aba.
 *
 * Nada aqui é dado pessoal: são rótulos de campanha e identificadores de
 * clique que o próprio anunciante gerou.
 */

const CHAVE_PRIMEIRO = 'sushiart.atribuicao.primeiro';
const CHAVE_ULTIMO = 'sushiart.atribuicao.ultimo';

const CAMPOS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CAMPOS_CLIQUE = ['fbclid', 'gclid'];

/**
 * Toda leitura e escrita passa por aqui.
 *
 * `localStorage` lança em aba anônima de alguns navegadores e quando o usuário
 * bloqueia dados de site. Analytics nunca pode derrubar o app: na dúvida,
 * devolve vazio e a venda segue.
 */
function ler(chave) {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem espaço ou sem permissão. Não é motivo para interromper nada.
  }
}

/** Lê os parâmetros de campanha da URL atual. Devolve `null` se não houver. */
function daUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const dados = {};

    for (const campo of [...CAMPOS_UTM, ...CAMPOS_CLIQUE]) {
      const valor = params.get(campo);
      // Corta em 200: parâmetro de campanha legítimo é curto, e isso evita
      // encher o armazenamento com uma URL colada errada.
      if (valor) dados[campo] = valor.slice(0, 200);
    }

    return Object.keys(dados).length ? dados : null;
  } catch {
    return null;
  }
}

/**
 * Registra a chegada. Chamada uma vez, quando o app monta.
 *
 * Sem parâmetro na URL não apaga nada: a pessoa que entrou pelo anúncio e
 * depois voltou digitando o endereço continua creditada à campanha.
 */
export function registrarChegada() {
  const agora = daUrl();
  if (!agora) return;

  const registro = {
    ...agora,
    landing_page: window.location.pathname + window.location.search,
    at: new Date().toISOString(),
  };

  // O primeiro toque só é gravado se ainda não existir. É a regra inteira do
  // "não sobrescrever" — e ela vive aqui, num lugar só.
  if (!ler(CHAVE_PRIMEIRO)) gravar(CHAVE_PRIMEIRO, registro);

  gravar(CHAVE_ULTIMO, registro);
}

/** O que o pedido leva junto para o banco. `null` quando não há origem alguma. */
export function atribuicaoDoPedido() {
  const primeiro = ler(CHAVE_PRIMEIRO);
  const ultimo = ler(CHAVE_ULTIMO);
  if (!primeiro && !ultimo) return null;

  const base = ultimo ?? primeiro;

  return {
    // O último toque é o que responde "o que trouxe esta compra".
    utm_source: base.utm_source ?? null,
    utm_medium: base.utm_medium ?? null,
    utm_campaign: base.utm_campaign ?? null,
    utm_content: base.utm_content ?? null,
    utm_term: base.utm_term ?? null,
    fbclid: base.fbclid ?? null,
    gclid: base.gclid ?? null,
    landing_page: base.landing_page ?? null,

    // O primeiro toque vai inteiro num campo à parte, para a análise poder
    // comparar os dois sem precisar de uma segunda tabela.
    primeiro_toque: primeiro ?? null,
    first_touch_at: primeiro?.at ?? null,
    last_touch_at: ultimo?.at ?? null,
  };
}

/** Para o modo de depuração e para a tela de diagnóstico. */
export function verAtribuicao() {
  return { primeiro: ler(CHAVE_PRIMEIRO), ultimo: ler(CHAVE_ULTIMO) };
}

/** Usado nos testes e quando o cliente pede para esquecer os dados dele. */
export function limparAtribuicao() {
  try {
    window.localStorage.removeItem(CHAVE_PRIMEIRO);
    window.localStorage.removeItem(CHAVE_ULTIMO);
  } catch {
    // Idem: falhar aqui não pode quebrar nada.
  }
}
