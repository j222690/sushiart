/**
 * PARTE 1 de 2 — roda no SEU navegador, no console do DevTools.
 *
 * Coleta so os NOMES e os LINKS das fotos. Quem baixa e o `importar-fotos.mjs`,
 * com Playwright, indo direto na URL de cada imagem.
 *
 * Por que nao baixar aqui: o CDN `client-assets.anota.ai` nao manda o cabecalho
 * `Access-Control-Allow-Origin`, entao o `fetch` da pagina e bloqueado e o
 * canvas fica "tainted" (as <img> carregaram sem `crossorigin`, logo o
 * `toDataURL` lanca). Os dois caminhos do navegador estao fechados — testado.
 * Ja um navegador indo direto na URL da imagem baixa numa boa: e assim que o
 * importador faz.
 *
 * COMO USAR
 *   1. Abra https://pedido.anota.ai/loja/sushiart-emporio-do-sushi
 *   2. F12 → Console. No Chrome, digite `allow pasting` e Enter antes de colar.
 *   3. Cole este arquivo inteiro e de Enter
 *   4. Ele baixa `fotos-anota.json` na hora — leve, so texto
 */
(async () => {
  const MIN_PX = 80; // ignora icone, bandeira de pagamento, avatar
  const PRECO = /R\$\s*\d/;
  // O placeholder deles: se entrasse, o produto ficaria com um cinza generico
  // no lugar do nosso fallback com a marca, que e melhor.
  const PLACEHOLDER = /item_no_image/i;

  const log = (m, c = '#912825') => console.log(`%c${m}`, `color:${c};font-weight:bold`);

  log('Rolando a pagina para carregar todas as fotos...');
  let altura = 0;
  for (let i = 0; i < 60; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    if (document.body.scrollHeight === altura) break;
    altura = document.body.scrollHeight;
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 800));

  // Sobe na arvore ate o primeiro ancestral que contenha um preco: num cardapio
  // esse e o card do produto. Mais confiavel do que cravar nome de classe, que
  // muda a cada deploy do Anota AI.
  function cardDe(img) {
    let el = img.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      if (PRECO.test(el.innerText || '')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function nomeDe(card, img) {
    const linhas = (card.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !PRECO.test(s))
      .filter((s) => s.length >= 4 && s.length <= 90);
    return linhas[0] || img.alt || '';
  }

  const loja = (document.title || '').trim().toLowerCase();
  const itens = [];
  const vistos = new Set();

  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    if (!src || !/^https?:/.test(src)) continue;
    if (PLACEHOLDER.test(src)) continue;
    if (img.naturalWidth < MIN_PX || img.naturalHeight < MIN_PX) continue;
    if (vistos.has(src)) continue;

    const card = cardDe(img);
    if (!card) continue;

    const nome = nomeDe(card, img);
    if (!nome) continue;
    // O cabecalho da loja tambem tem preco por perto (taxa de entrega) e cai no
    // filtro do card. Pelo nome da-se para reconhecer.
    if (nome.trim().toLowerCase() === loja) continue;

    vistos.add(src);
    itens.push({ nome, foto: src, w: img.naturalWidth, h: img.naturalHeight });
  }

  log(`${itens.length} foto(s) encontradas.`);
  console.table(itens.map(({ nome, w, h }) => ({ nome, resolucao: `${w}x${h}` })));

  if (!itens.length) {
    console.warn('Nada encontrado. Me mande o HTML de um card que eu ajusto os seletores.');
    return;
  }

  const blob = new Blob(
    [JSON.stringify({ origem: location.href, coletadoEm: new Date().toISOString(), itens }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fotos-anota.json';
  a.click();
  URL.revokeObjectURL(a.href);

  log('fotos-anota.json baixado. Mova para a pasta do projeto.');
})();
