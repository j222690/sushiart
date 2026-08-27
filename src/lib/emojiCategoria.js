/**
 * Emoji de cada categoria do cardápio.
 *
 * Por slug, com palavras-chave como reserva: assim uma categoria criada no
 * painel amanhã ("Poke", "Yakisoba") já nasce com figura, em vez de cair num
 * quadrado vazio até alguém mexer no código.
 */
const POR_SLUG = {
  combinados: '🍱',
  entradas: '🥢',
  hot: '🔥',
  uramaki: '🍣',
  especiais: '⭐',
  djow: '✨',
  hossomaki: '🍙',
  niguiri: '🍤',
  sashimis: '🐟',
  temakis: '🌯',
  porcoes: '🍢',
  sobremesas: '🍰',
  bebidas: '🥤',
};

const POR_PALAVRA = [
  [/bebida|refrigerante|agua|suco|cerveja/i, '🥤'],
  [/sobremesa|doce|nutella|banana/i, '🍰'],
  [/combinado|combo|especial/i, '🍱'],
  [/temaki/i, '🌯'],
  [/sashimi|salmao|salmão|peixe/i, '🐟'],
  [/niguiri|nigiri/i, '🍤'],
  [/hosso|maki|uramaki/i, '🍣'],
  [/hot|frito|empanado/i, '🔥'],
  [/entrada|sunomono|salada|ceviche/i, '🥢'],
  [/porcao|porção|poke/i, '🍢'],
];

export function emojiCategoria(categoria) {
  const slug = (categoria?.slug || '').toLowerCase();
  if (POR_SLUG[slug]) return POR_SLUG[slug];

  const texto = `${slug} ${categoria?.name || ''}`;
  for (const [padrao, emoji] of POR_PALAVRA) {
    if (padrao.test(texto)) return emoji;
  }
  return '🍽️';
}

/**
 * Fundo de cada card, girando numa paleta fixa.
 *
 * A cor sai do índice, não do nome: assim a grade nunca repete tons vizinhos e
 * a tela continua legível quando o restaurante criar mais categorias.
 */
const FUNDOS = [
  'from-[#8B2635] to-[#611A1B]',
  'from-[#B0632C] to-[#8A4718]',
  'from-[#2F6B45] to-[#1E4A2E]',
  'from-[#3A5F8A] to-[#26405E]',
  'from-[#7B4B86] to-[#553261]',
  'from-[#A33F52] to-[#7A2A38]',
];

export function fundoCategoria(indice) {
  return FUNDOS[indice % FUNDOS.length];
}
