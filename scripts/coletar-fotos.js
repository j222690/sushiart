/**
 * PARTE 1 de 2 — roda no SEU navegador, no console do DevTools.
 *
 * Por que não é um script automático: a página do Anota AI fica atrás de
 * Cloudflare, que bloqueia navegador automatizado (testado — devolve 403 e a
 * tela "you have been blocked"). O seu navegador passa porque é uma pessoa de
 * verdade acessando. Então a coleta fica aqui, e a parte chata — baixar, casar
 * com os 66 produtos e subir — fica no `importar-fotos.mjs`.
 *
 * COMO USAR
 *   1. Abra https://pedido.anota.ai/loja/sushiart-emporio-do-sushi
 *   2. F12 → aba Console
 *   3. Cole este arquivo inteiro e dê Enter
 *   4. Ele rola a página sozinho (pra carregar as fotos preguiçosas), mostra
 *      uma tabela do que achou e baixa `fotos-anota.json`
 *   5. Confira a tabela. Se vier torto, me diga o que saiu que eu ajusto os
 *      seletores — sem ver o HTML da página eu chutei pela estrutura comum
 *      de cardápio (card com foto + nome + preço).
 */
(async () => {
  const MIN_PX = 80; // ignora ícone, logo, bandeira de pagamento
  const PRECO = /R\$\s*\d/;

  // --- rola até o fim para disparar o lazy-load das fotos --------------------
  console.log('%cRolando a página para carregar todas as fotos...', 'color:#912825;font-weight:bold');
  let altura = 0;
  for (let i = 0; i < 60; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    if (document.body.scrollHeight === altura) break;
    altura = document.body.scrollHeight;
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 800));

  // --- acha o "card" de cada foto -------------------------------------------
  // Sobe na árvore até o primeiro ancestral que contenha um preço: num cardápio
  // esse é o card do produto. Mais confiável do que cravar nome de classe, que
  // muda a cada deploy do Anota AI.
  function cardDe(img) {
    let el = img.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      if (PRECO.test(el.innerText || '')) return el;
      el = el.parentElement;
    }
    return null;
  }

  // O nome é a primeira linha de texto com cara de nome: não é preço, não é
  // rótulo curto ("Novo", "Esgotado"), não é a descrição longa.
  function nomeDe(card, img) {
    const linhas = (card.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !PRECO.test(s))
      .filter((s) => s.length >= 4 && s.length <= 90);
    return linhas[0] || img.alt || '';
  }

  const vistos = new Set();
  const itens = [];

  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    if (!src || !/^https?:/.test(src)) continue;
    if (img.naturalWidth < MIN_PX || img.naturalHeight < MIN_PX) continue;
    if (vistos.has(src)) continue;

    const card = cardDe(img);
    if (!card) continue; // sem preço por perto: provavelmente banner ou logo

    const nome = nomeDe(card, img);
    if (!nome) continue;

    vistos.add(src);
    itens.push({ nome, foto: src });
  }

  console.log(`%c${itens.length} produto(s) com foto encontrados.`, 'color:#912825;font-weight:bold');
  console.table(itens);

  if (!itens.length) {
    console.warn(
      'Nada encontrado. Me mande o HTML de um card (botão direito num produto → ' +
        'Inspecionar → botão direito no elemento → Copy → Copy outerHTML) que eu ajusto.'
    );
    return;
  }

  const blob = new Blob([JSON.stringify({ origem: location.href, coletadoEm: new Date().toISOString(), itens }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fotos-anota.json';
  a.click();
  URL.revokeObjectURL(a.href);

  console.log('%cfotos-anota.json baixado. Mova para a pasta do projeto.', 'color:#912825;font-weight:bold');
})();
