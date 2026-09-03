/**
 * Ícones das categorias do cardápio, desenhados aqui.
 *
 * Substituem os emojis. O problema do emoji não era o desenho: é que cada
 * sistema desenha o seu. O cliente no iPhone via um app, o do Android via
 * outro, e o do desktop às vezes via um quadrado vazio — três aparências para
 * a mesma marca. Traço próprio fica igual em todo lugar e combina com a
 * tipografia, que emoji nenhum combina.
 *
 * Todos em `viewBox` 24 e em `currentColor`: a cor vem de quem usa, então o
 * mesmo ícone serve no card de fundo cheio e na lista de fundo claro.
 *
 * A busca é por slug, com palavras-chave como reserva — uma categoria criada
 * no painel amanhã ("Poke", "Yakisoba") já nasce com figura em vez de cair num
 * espaço vazio até alguém mexer no código.
 */

function Svg({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Marmita bento, com as divisórias. */
const Combinados = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M9 6v12M15 6v12M15 12h6.5" />
  </Svg>
);

/** Par de hashi cruzado. */
const Entradas = (p) => (
  <Svg {...p}>
    <path d="M4 19 19 5M8 19 21 8" />
    <path d="M3.2 20.4a1.2 1.2 0 0 0 1.7 0" />
  </Svg>
);

/** Chama. */
const Hot = (p) => (
  <Svg {...p}>
    <path d="M12 2.5c3.4 3.6 5.5 6.2 5.5 9.3a5.5 5.5 0 1 1-11 0c0-1.6.6-3 1.8-4.6.5 1.3 1.3 2 2.3 2.2-.3-2.4.2-4.6 1.4-6.9Z" />
  </Svg>
);

/** Uramaki visto de cima: arroz por fora, recheio no meio. */
const Uramaki = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r="1.6" />
  </Svg>
);

/** Estrela dos especiais. */
const Especiais = (p) => (
  <Svg {...p}>
    <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z" />
  </Svg>
);

/** Brilho — a linha assinada da casa. */
const Djow = (p) => (
  <Svg {...p}>
    <path d="M12 2.5 13.7 9 20 10.8 13.7 12.6 12 19.2 10.3 12.6 4 10.8 10.3 9 12 2.5Z" />
    <path d="M18.5 16.5 19.2 19l2.3.7-2.3.8-.7 2.4-.7-2.4-2.3-.8 2.3-.7.7-2.5Z" />
  </Svg>
);

/** Hossomaki: rolinho fino, dois deles. */
const Hossomaki = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="13.5" r="5" />
    <circle cx="8" cy="13.5" r="1.7" />
    <circle cx="17" cy="9.5" r="4.2" />
    <circle cx="17" cy="9.5" r="1.4" />
  </Svg>
);

/** Niguiri de lado: bolinho de arroz com a fatia por cima. */
const Niguiri = (p) => (
  <Svg {...p}>
    <path d="M3.8 15.5c0-1.9 3.7-3.2 8.2-3.2s8.2 1.3 8.2 3.2-3.7 3.2-8.2 3.2-8.2-1.3-8.2-3.2Z" />
    <path d="M3.9 12.6C5 10.4 8.2 8.9 12 8.9s7 1.5 8.1 3.7" />
    <path d="M9.5 10.2c1.6 1 3.4 1 5 0" />
  </Svg>
);

/** Peixe do sashimi. */
const Sashimis = (p) => (
  <Svg {...p}>
    <path d="M3 12c2.6-3.6 6-5.4 9.6-5.4 3.5 0 6.2 1.8 8.4 5.4-2.2 3.6-4.9 5.4-8.4 5.4C9 17.4 5.6 15.6 3 12Z" />
    <circle cx="8.4" cy="11" r="1" fill="currentColor" stroke="none" />
    <path d="M17 9.4c1.2 1.4 1.2 3.8 0 5.2" />
  </Svg>
);

/** Temaki: o cone de alga. */
const Temakis = (p) => (
  <Svg {...p}>
    <path d="M7 3.2 18.6 6.4 12.2 21 7 3.2Z" />
    <path d="M8.6 8.4c1.7 1 3.4 1.5 5.2 1.5" />
  </Svg>
);

/** Espetinho de porção. */
const Porcoes = (p) => (
  <Svg {...p}>
    <path d="M12 20.5V16" />
    <circle cx="12" cy="12.8" r="3.1" />
    <circle cx="12" cy="6.2" r="3.1" />
  </Svg>
);

/** Fatia de bolo. */
const Sobremesas = (p) => (
  <Svg {...p}>
    <path d="M4 19h16v-6.5c0-1-.9-1.5-2.4-1.5H6.4C4.9 11 4 11.5 4 12.5V19Z" />
    <path d="M6.4 11c0-2.4 2.5-4 5.6-4s5.6 1.6 5.6 4" />
    <path d="M12 7V4.2" />
    <circle cx="12" cy="3.4" r=".9" />
  </Svg>
);

/** Copo com canudo. */
const Bebidas = (p) => (
  <Svg {...p}>
    <path d="M5.6 7h12.8l-1.3 12.2c-.1.9-.9 1.6-1.8 1.6H8.7c-.9 0-1.7-.7-1.8-1.6L5.6 7Z" />
    <path d="M6.3 11.6h11.4" />
    <path d="M13.6 7 15.4 2.6" />
  </Svg>
);

/** Prato — reserva de quem não casar com nada. */
const Generico = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
  </Svg>
);

const POR_SLUG = {
  combinados: Combinados,
  entradas: Entradas,
  hot: Hot,
  uramaki: Uramaki,
  especiais: Especiais,
  djow: Djow,
  hossomaki: Hossomaki,
  niguiri: Niguiri,
  sashimis: Sashimis,
  temakis: Temakis,
  porcoes: Porcoes,
  sobremesas: Sobremesas,
  bebidas: Bebidas,
};

const POR_PALAVRA = [
  [/bebida|refrigerante|agua|água|suco|cerveja|drink/i, Bebidas],
  [/sobremesa|doce|nutella|banana|bolo/i, Sobremesas],
  [/combinado|combo/i, Combinados],
  [/temaki/i, Temakis],
  [/sashimi|peixe/i, Sashimis],
  [/niguiri|nigiri/i, Niguiri],
  [/hosso/i, Hossomaki],
  [/uramaki|maki|roll/i, Uramaki],
  [/hot|frito|empanado|crocante/i, Hot],
  [/entrada|sunomono|salada|ceviche|guioza/i, Entradas],
  [/porcao|porção|poke|yakisoba|espeto/i, Porcoes],
  [/especial|premium|chef/i, Especiais],
];

/** Devolve o componente de ícone da categoria — sempre um, nunca nulo. */
export function iconeCategoria(categoria) {
  const slug = (categoria?.slug || '').toLowerCase();
  if (POR_SLUG[slug]) return POR_SLUG[slug];

  const texto = `${slug} ${categoria?.name || ''}`;
  for (const [padrao, Icone] of POR_PALAVRA) {
    if (padrao.test(texto)) return Icone;
  }
  return Generico;
}

/**
 * O nome da categoria em japonês, para a coluna vertical (縦書き) do cardápio.
 *
 * São os termos que aparecem em cardápio japonês de verdade, não tradução
 * literal: 前菜 é a seção de entradas, 甘味 é a de doces, 一品 é o prato avulso.
 *
 * A coluna vertical só funciona com palavra curta — em português "Combinados"
 * viraria uma torre de dez letras, ilegível. Em kanji são dois caracteres, que
 * é exatamente o que a escrita vertical foi feita para carregar.
 */
const KANJI = {
  combinados: '盛合',
  entradas: '前菜',
  hot: '揚物',
  uramaki: '裏巻',
  especiais: '特選',
  djow: '特製',
  hossomaki: '細巻',
  niguiri: '握り',
  sashimis: '刺身',
  temakis: '手巻',
  porcoes: '一品',
  sobremesas: '甘味',
  bebidas: '飲物',
};

/** Kanji da categoria, ou `null` se não houver um honesto para ela. */
export function kanjiCategoria(categoria) {
  const slug = (categoria?.slug || '').toLowerCase();
  if (KANJI[slug]) return KANJI[slug];

  // Sem correspondência, devolve nulo em vez de um kanji genérico: inventar
  // japonês para uma categoria que o restaurante criou ("Yakisoba", "Poke")
  // seria escrever errado numa língua que parte dos clientes lê.
  return null;
}
