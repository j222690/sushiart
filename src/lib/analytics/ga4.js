/**
 * Google Analytics 4.
 *
 * Mesma postura do Meta Pixel: carrega uma vez, só com
 * `VITE_GA_MEASUREMENT_ID` presente, e só a camada neutra fala com este
 * arquivo.
 *
 * O GA4 tem nomes e formatos próprios (`view_item`, `add_to_cart`, `items[]`
 * com `item_id`) — traduzir do vocabulário da Meta para o do Google é papel
 * daqui, não das telas.
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

let carregado = false;

export function ga4Configurado() {
  return Boolean(GA_ID);
}

export function iniciarGa4() {
  if (!GA_ID || carregado || typeof window === 'undefined') return;
  carregado = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  // Precisa ser `function` com `arguments`: o gtag empurra o objeto
  // `arguments` cru para o dataLayer, e arrow function não tem `arguments`.
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  // `send_page_view: false` porque quem conta página aqui é a camada de rotas.
  // Com o automático ligado, a primeira tela contaria duas vezes — e num SPA o
  // automático ainda erra as seguintes, porque não há recarga de página.
  window.gtag('config', GA_ID, { send_page_view: false });
}

export function ga4Track(evento, dados = {}) {
  if (!GA_ID || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', evento, dados);
}

/**
 * Converte os itens do nosso formato para o do GA4.
 *
 * `price` em reais decimais, não em centavos: o banco guarda centavos e o GA4
 * espera a moeda. Enviar 8499 onde se esperava 84,99 infla o faturamento do
 * relatório em cem vezes — e o erro só aparece quando alguém estranha o número.
 */
export function itensGa4(itens = []) {
  return itens.map((item, indice) => ({
    item_id: item.id,
    item_name: item.nome,
    price: Number((item.precoCentavos / 100).toFixed(2)),
    quantity: item.quantidade ?? 1,
    index: indice,
    ...(item.categoria ? { item_category: item.categoria } : {}),
  }));
}
