/**
 * Casamento de nome de produto entre o cardapio do site e o do banco.
 *
 * Mora separado porque e a parte que pode estragar dado: o import escreve
 * image_url em cima do produto que este arquivo apontar. Tem teste ao lado
 * (`casar-nomes.test.mjs`, roda com `node --test scripts/`).
 */

/** Abaixo disso o par nao entra sozinho: vira "nao casou" e voce sobe na mao. */
export const CERTEZA_MINIMA = 0.55;

// "Peças" e "unidades" nao distinguem nada num cardapio de sushi — todo item
// tem. Ja o NUMERO distingue tudo: o cardapio real tem "Especial 40 Peças",
// "Especial 42 Peças" e "Especial 35 Peças + Entrada de Sunomono", que sem o
// numero viram todos "especial" e casam errado entre si.
const UNIDADES = /\b(pecas?|unidades?|un)\b/g;

export function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento soltas pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // parentese, "+", "c/" viram espaco
    .replace(UNIDADES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IRRELEVANTES = new Set(['de', 'do', 'da', 'com', 'e', 'no', 'na', 'em', 'a', 'o']);

export function tokens(s) {
  return new Set(
    normalizar(s)
      .split(' ')
      // Numero fica mesmo com um digito so ("Niguiri (4 peças)"); palavra de
      // uma letra e sobra de "c/" ou "s/" e nao ajuda.
      .filter((t) => (t.length > 1 || /\d/.test(t)) && !IRRELEVANTES.has(t))
  );
}

const numeros = (s) => new Set(normalizar(s).split(' ').filter((t) => /^\d+$/.test(t)));

/**
 * Numero e sinal forte, nao mais um token no meio dos outros.
 *
 * "Enamorado 45 Peças + 1 Ceviche + 1 Sunomono" e "Enamorado 60 Peças + 1
 * Ceviche + 1 Sunomono" compartilham 3 dos 4 tokens e batiam 75% no Dice puro
 * — casariam trocado. Sao combos diferentes, e a unica coisa que os separa e o
 * numero.
 *
 * Quando um dos lados nao tem numero nenhum, nao ha o que comparar: o site pode
 * escrever "Combo Só Salmão" onde o banco tem "Combo Só Salmão (35 Peças)".
 */
function numerosCompativeis(a, b) {
  const na = numeros(a);
  const nb = numeros(b);
  if (!na.size || !nb.size) return true;
  if (na.size !== nb.size) return false;
  for (const n of na) if (!nb.has(n)) return false;
  return true;
}

/**
 * Dice: duas vezes a intersecao sobre a soma dos tamanhos. Perdoa uma palavra a
 * mais de um lado ("Especial"), que e a diferenca tipica entre os dois
 * cardapios, sem perdoar troca de ingrediente.
 */
export function semelhanca(a, b) {
  if (!numerosCompativeis(a, b)) return 0;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return (2 * comuns) / (ta.size + tb.size);
}

/**
 * Resolve o casamento inteiro de uma vez.
 *
 * Guloso, mas percorrendo da melhor pontuacao para a pior: o par obvio fecha
 * primeiro e nao corre o risco de ter a foto levada por um parecido que aparece
 * antes na lista. Cada foto vai para no maximo um produto.
 *
 * @returns {{casados: Map<string, {item: object, score: number}>, fotosUsadas: Set<string>}}
 */
export function casar(produtos, itens, minimo = CERTEZA_MINIMA) {
  const pares = [];
  for (const p of produtos) {
    for (const item of itens) {
      const score = semelhanca(p.name, item.nome);
      if (score >= minimo) pares.push({ p, item, score });
    }
  }
  pares.sort((a, b) => b.score - a.score);

  const casados = new Map();
  const fotosUsadas = new Set();
  for (const { p, item, score } of pares) {
    if (casados.has(p.id) || fotosUsadas.has(item.foto)) continue;
    casados.set(p.id, { item, score });
    fotosUsadas.add(item.foto);
  }
  return { casados, fotosUsadas };
}
