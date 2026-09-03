import { iniciarMeta, metaConfigurado, metaTrack } from './meta';
import { ga4Configurado, ga4Track, iniciarGa4, itensGa4 } from './ga4';
import { atribuicaoDoPedido, registrarChegada, verAtribuicao } from './atribuicao';

/**
 * Camada de analytics do app.
 *
 * As telas chamam SÓ estas funções. Nenhum componente sabe que existe Meta
 * Pixel ou GA4 — é isso que permite acrescentar (ou tirar) um provedor mexendo
 * num arquivo, em vez de caçar disparos por dez telas.
 *
 * TRÊS REGRAS QUE VALEM PARA TUDO AQUI
 *
 * 1. Analytics nunca derruba o app. Cada disparo é embrulhado: bloqueador de
 *    anúncio, rede caída ou provedor fora do ar não podem impedir alguém de
 *    fechar um pedido. Medir a venda vale menos que fazer a venda.
 *
 * 2. Valor vai em reais, sempre. O banco guarda centavos; converter no ponto
 *    de saída, num lugar só, evita o relatório com faturamento cem vezes maior
 *    — erro que só aparece quando alguém estranha o número.
 *
 * 3. Sem variável de ambiente, o provedor nem carrega. App sem pixel
 *    configurado não baixa script de terceiro nenhum.
 */

const DEBUG = import.meta.env.VITE_ANALYTICS_DEBUG === 'true' || import.meta.env.DEV;

function log(evento, dados) {
  // Só em desenvolvimento ou com a variável ligada de propósito. Em produção o
  // console fica limpo.
  if (DEBUG) console.info(`[analytics] ${evento}`, dados ?? '');
}

/** Nenhum erro de medição pode escapar para a tela. */
function seguro(nome, fn) {
  try {
    fn();
  } catch (erro) {
    if (DEBUG) console.warn(`[analytics] falhou em ${nome}:`, erro);
  }
}

const reais = (centavos) => Number(((centavos ?? 0) / 100).toFixed(2));

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

/** Chamada uma vez, quando o app monta. */
export function iniciarAnalytics() {
  seguro('iniciar', () => {
    // A origem é registrada ANTES dos provedores: se o script do pixel demorar
    // ou for bloqueado, a atribuição da campanha não se perde junto.
    registrarChegada();
    iniciarMeta();
    iniciarGa4();
    log('iniciado', {
      meta: metaConfigurado(),
      ga4: ga4Configurado(),
      origem: verAtribuicao(),
    });
  });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export function trackPageView(caminho) {
  seguro('pageView', () => {
    metaTrack('PageView');
    ga4Track('page_view', {
      page_path: caminho,
      page_location: window.location.href,
      page_title: document.title,
    });
    log('page_view', caminho);
  });
}

/**
 * @param {{id: string, nome: string, precoCentavos: number, categoria?: string}} produto
 */
export function trackViewContent(produto) {
  if (!produto?.id) return;

  seguro('viewContent', () => {
    metaTrack('ViewContent', {
      content_ids: [produto.id],
      content_name: produto.nome,
      content_type: 'product',
      value: reais(produto.precoCentavos),
      currency: 'BRL',
    });
    ga4Track('view_item', {
      currency: 'BRL',
      value: reais(produto.precoCentavos),
      items: itensGa4([produto]),
    });
    log('view_item', produto.nome);
  });
}

export function trackAddToCart(produto, quantidade = 1) {
  if (!produto?.id) return;

  seguro('addToCart', () => {
    const valor = reais(produto.precoCentavos * quantidade);

    metaTrack('AddToCart', {
      content_ids: [produto.id],
      content_name: produto.nome,
      content_type: 'product',
      contents: [{ id: produto.id, quantity: quantidade }],
      value: valor,
      currency: 'BRL',
    });
    ga4Track('add_to_cart', {
      currency: 'BRL',
      value: valor,
      items: itensGa4([{ ...produto, quantidade }]),
    });
    log('add_to_cart', `${quantidade}x ${produto.nome}`);
  });
}

export function trackInitiateCheckout({ itens = [], totalCentavos = 0 } = {}) {
  seguro('initiateCheckout', () => {
    const quantidade = itens.reduce((s, i) => s + (i.quantidade ?? 1), 0);

    metaTrack('InitiateCheckout', {
      content_ids: itens.map((i) => i.id),
      contents: itens.map((i) => ({ id: i.id, quantity: i.quantidade ?? 1 })),
      content_type: 'product',
      value: reais(totalCentavos),
      currency: 'BRL',
      num_items: quantidade,
    });
    ga4Track('begin_checkout', {
      currency: 'BRL',
      value: reais(totalCentavos),
      items: itensGa4(itens),
    });
    log('begin_checkout', `${quantidade} itens · ${reais(totalCentavos)}`);
  });
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

const CHAVE_CONVERSOES = 'sushiart.analytics.compras';

/**
 * Este pedido já foi contado como venda?
 *
 * A pergunta existe porque a tela do pedido se atualiza em tempo real e a
 * pessoa recarrega, volta, abre em outra aba. Sem trava, um pedido de R$ 90
 * viraria três conversões de R$ 90 — e o relatório de campanha passaria a
 * mentir para mais, que é o pior jeito de mentir: ninguém desconfia de
 * resultado bom.
 *
 * `localStorage` e não memória: recarregar a página zera a memória, e é
 * justamente a recarga que se quer sobreviver.
 */
function jaContado(orderId) {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CHAVE_CONVERSOES) || '[]');
    return lista.includes(orderId);
  } catch {
    // Sem como conferir, é mais seguro NÃO disparar: conversão a menos é um
    // dado faltando, conversão a mais é uma decisão de verba errada.
    return true;
  }
}

function marcarContado(orderId) {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CHAVE_CONVERSOES) || '[]');
    lista.push(orderId);
    // Guarda só os últimos 50: a lista existe para evitar repetição recente,
    // não para ser histórico de compras.
    window.localStorage.setItem(CHAVE_CONVERSOES, JSON.stringify(lista.slice(-50)));
  } catch {
    // Idem.
  }
}

/** O mesmo id nos dois lados é o que faz a Meta juntar navegador e servidor. */
export function eventIdDaCompra(orderId) {
  return `purchase_${orderId}`;
}

/**
 * Venda concluída.
 *
 * SÓ deve ser chamada quando o pagamento está confirmado de verdade — pedido
 * criado não é venda, e clicar em "finalizar" muito menos. Quem decide isso é
 * quem chama (a tela do pedido, olhando o status vindo do banco); aqui só se
 * garante que o mesmo pedido não conte duas vezes.
 *
 * Devolve `false` quando o disparo foi ignorado por já ter acontecido.
 */
export function trackPurchase({ orderId, totalCentavos, itens = [] } = {}) {
  if (!orderId) return false;
  if (jaContado(orderId)) {
    log('purchase ignorado (já contado)', orderId);
    return false;
  }

  marcarContado(orderId);

  seguro('purchase', () => {
    const quantidade = itens.reduce((s, i) => s + (i.quantidade ?? 1), 0);
    const valor = reais(totalCentavos);

    metaTrack(
      'Purchase',
      {
        value: valor,
        currency: 'BRL',
        content_ids: itens.map((i) => i.id),
        contents: itens.map((i) => ({ id: i.id, quantity: i.quantidade ?? 1 })),
        content_type: 'product',
        num_items: quantidade,
        order_id: orderId,
      },
      eventIdDaCompra(orderId)
    );

    ga4Track('purchase', {
      transaction_id: orderId,
      currency: 'BRL',
      value: valor,
      items: itensGa4(itens),
    });

    log('purchase', `${orderId} · R$ ${valor}`);
  });

  return true;
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

export { atribuicaoDoPedido, verAtribuicao } from './atribuicao';

/**
 * Diagnóstico rápido. No navegador: `window.debugAnalytics()`.
 *
 * Existe porque conferir se o pixel disparou olhando a aba de rede é
 * trabalhoso, e "não sei se está medindo" costuma virar semanas de campanha
 * sem dado.
 */
export function debugAnalytics() {
  const estado = {
    metaPixel: metaConfigurado() ? 'configurado' : 'SEM VITE_META_PIXEL_ID',
    ga4: ga4Configurado() ? 'configurado' : 'SEM VITE_GA_MEASUREMENT_ID',
    fbqCarregado: typeof window !== 'undefined' && Boolean(window.fbq),
    gtagCarregado: typeof window !== 'undefined' && Boolean(window.gtag),
    origem: verAtribuicao(),
    comprasJaContadas: (() => {
      try {
        return JSON.parse(window.localStorage.getItem(CHAVE_CONVERSOES) || '[]');
      } catch {
        return 'ilegível';
      }
    })(),
  };
  console.table(estado);
  return estado;
}

if (typeof window !== 'undefined') {
  window.debugAnalytics = debugAnalytics;
}
