// node --test scripts/
//
// Os nomes daqui saem do cardapio real (supabase/cardapio-real.sql). O que o
// Anota AI devolve ainda nao foi visto de perto — a pagina esta atras de
// Cloudflare — entao as variantes sao as diferencas tipicas entre dois
// cardapios da mesma casa: caixa, acento, "c/", quantidade entre parenteses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, semelhanca, casar, CERTEZA_MINIMA } from './casar-nomes.mjs';

test('normalizar tira acento, caixa e pontuacao', () => {
  assert.equal(normalizar('Carpaccio de Salmão'), 'carpaccio de salmao');
  assert.equal(normalizar('Combo Só Salmão (35 Peças)'), 'combo so salmao 35');
  // "c/" vira "com", nao um "c" solto que o filtro de token jogaria fora.
  assert.equal(normalizar('Sunomono c/ Salmão'), 'sunomono com salmao');
  assert.equal(normalizar('Água S/ Gás'), 'agua sem gas');
});

test('a contagem de pecas sobrevive — e o que separa os combos', () => {
  assert.match(normalizar('Especial 40 Peças'), /\b40\b/);
  assert.match(normalizar('Especial 42 Peças'), /\b42\b/);
  assert.equal(normalizar('Niguiri (4 peças)'), 'niguiri 4');
});

test('combos que so diferem no numero NAO casam entre si', () => {
  // Esta e a armadilha: sem o numero os tres viram "especial" e trocam de foto.
  assert.ok(semelhanca('Especial 40 Peças', 'Especial 42 Peças') < CERTEZA_MINIMA);
  assert.ok(semelhanca('Especial 40 Peças', 'Especial 35 Peças + Entrada de Sunomono') < CERTEZA_MINIMA);
  assert.ok(semelhanca('Enamorado 45 Peças + 1 Ceviche', 'Enamorado 60 Peças + 1 Ceviche') < CERTEZA_MINIMA);
});

test('mesma coisa escrita diferente casa', () => {
  assert.equal(semelhanca('Especial 40 Peças', 'ESPECIAL 40 PEÇAS'), 1);
  assert.equal(semelhanca('Carpaccio de Salmão', 'Carpaccio Salmao'), 1);
  assert.equal(semelhanca('Sunomono com Salmão', 'Sunomono c/ Salmão'), 1);
  assert.equal(semelhanca('Combo Só Salmão (35 Peças)', 'Combo Só Salmão 35 peças'), 1);
});

test('"com" e "sem" nao podem casar entre si', () => {
  // Caso real da coleta de agosto/2026: a loja escreve "C/" e "S/", e sem
  // tratamento os dois nomes reduzem a {agua, gas} e trocavam de foto.
  assert.equal(semelhanca('Água com Gás', 'Água S/ Gás'), 0);
  assert.equal(semelhanca('Água sem Gás', 'Água C/ Gás'), 0);
  assert.equal(semelhanca('Temaki Filadélfia sem Arroz', 'Temaki Filadélfia Com Arroz'), 0);
});

test('"c/" e "s/" casam com "com" e "sem" escritos por extenso', () => {
  assert.equal(semelhanca('Água com Gás', 'Água C/ Gás'), 1);
  assert.equal(semelhanca('Água sem Gás', 'Água S/ Gás'), 1);
  assert.equal(semelhanca('Sunomono com Salmão', 'Sunomono C/ Salmão'), 1);
});

test('um lado sem marcador nao contradiz o outro', () => {
  assert.ok(semelhanca('Sunomono com Salmão', 'Sunomono Salmão') >= CERTEZA_MINIMA);
});

test('pratos diferentes que compartilham palavra nao casam', () => {
  assert.ok(semelhanca('Sunomono Simples', 'Sunomono com Salmão') < CERTEZA_MINIMA);
  assert.ok(semelhanca('Ceviche de Salmão', 'Carpaccio de Salmão') < CERTEZA_MINIMA);
  assert.equal(semelhanca('Combo Low Carb', 'Trio Hots Quentes'), 0);
});

test('casar nao entrega a mesma foto para dois produtos', () => {
  const produtos = [
    { id: 'a', name: 'Especial 40 Peças' },
    { id: 'b', name: 'Especial 42 Peças' },
  ];
  const itens = [{ nome: 'Especial 40 Peças', foto: 'https://x/40.jpg' }];

  const { casados } = casar(produtos, itens);
  assert.equal(casados.size, 1);
  assert.equal(casados.get('a').item.foto, 'https://x/40.jpg');
  assert.equal(casados.has('b'), false);
});

test('casar resolve o par obvio primeiro, nao por ordem de lista', () => {
  const produtos = [
    { id: 'a', name: 'Sunomono Simples' },
    { id: 'b', name: 'Sunomono com Salmão' },
  ];
  // A foto do Sunomono com Salmao aparece primeiro; o produto 'a' e testado
  // antes. Guloso ingenuo daria a foto errada para 'a'.
  const itens = [
    { nome: 'Sunomono com Salmão', foto: 'https://x/salmao.jpg' },
    { nome: 'Sunomono Simples', foto: 'https://x/simples.jpg' },
  ];

  const { casados } = casar(produtos, itens);
  assert.equal(casados.get('a').item.foto, 'https://x/simples.jpg');
  assert.equal(casados.get('b').item.foto, 'https://x/salmao.jpg');
});

test('produto sem par nenhum fica de fora', () => {
  const { casados } = casar(
    [{ id: 'a', name: 'Combo Low Carb' }],
    [{ nome: 'Temaki de Salmão', foto: 'https://x/t.jpg' }]
  );
  assert.equal(casados.size, 0);
});
