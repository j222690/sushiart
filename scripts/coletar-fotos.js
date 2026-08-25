/**
 * PARTE 1 de 2 — roda no SEU navegador, no console do DevTools.
 *
 * Coleta E BAIXA as fotos. O download tem que acontecer aqui porque o CDN do
 * Anota AI (client-assets.anota.ai) devolve 403 para requisicao de fora do
 * navegador — testado com GET, User-Agent de Chrome e Referer. Entao o JSON sai
 * daqui ja com os bytes de cada foto embutidos, e o `importar-fotos.mjs` so
 * decodifica e sobe, sem precisar buscar nada.
 *
 * COMO USAR
 *   1. Abra https://pedido.anota.ai/loja/sushiart-emporio-do-sushi
 *   2. F12 → aba Console (no Chrome, digite `allow pasting` antes de colar)
 *   3. Cole este arquivo inteiro e de Enter
 *   4. Espere: ele rola a pagina, mede cada foto e baixa uma por uma
 *   5. Confira a tabela e o relatorio, e mova `fotos-anota.json` para o projeto
 */
(async () => {
  const MIN_PX = 80; // ignora icone, bandeira de pagamento, avatar
  const PRECO = /R\$\s*\d/;
  // O placeholder deles: se entrasse, o produto ficaria com um cinza generico
  // no lugar do nosso fallback com a marca, que e melhor.
  const PLACEHOLDER = /item_no_image/i;

  const log = (msg, cor = '#912825') => console.log(`%c${msg}`, `color:${cor};font-weight:bold`);

  // --- rola ate o fim para disparar o lazy-load -------------------------------
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

  // --- acha o card de cada foto ----------------------------------------------
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

  // Se a pagina oferece varios tamanhos no srcset, `src` pode ser o pequeno que
  // coube no card. Pegamos o maior candidato — e a melhoria de qualidade mais
  // barata que existe aqui: mesma foto, mais pixel, sem custo nenhum.
  function melhorUrl(img) {
    const candidatos = (img.srcset || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [url, desc] = s.split(/\s+/);
        const larg = desc && desc.endsWith('w') ? parseInt(desc) : 0;
        return { url, larg };
      })
      .filter((c) => c.url);

    if (candidatos.length) {
      candidatos.sort((a, b) => b.larg - a.larg);
      return candidatos[0].url;
    }
    return img.currentSrc || img.src;
  }

  // --- varre a pagina ---------------------------------------------------------
  const loja = (document.title || '').trim().toLowerCase();
  const achados = [];

  for (const img of document.images) {
    const src = melhorUrl(img);
    if (!src || !/^https?:/.test(src)) continue;
    if (PLACEHOLDER.test(src)) continue;
    if (img.naturalWidth < MIN_PX || img.naturalHeight < MIN_PX) continue;

    const card = cardDe(img);
    if (!card) continue;

    const nome = nomeDe(card, img);
    if (!nome) continue;
    // O cabecalho da loja tambem tem preco por perto (taxa de entrega), entao
    // cai no filtro do card. Pelo nome da-se para reconhecer.
    if (nome.trim().toLowerCase() === loja) continue;

    achados.push({ nome, foto: src, w: img.naturalWidth, h: img.naturalHeight });
  }

  // --- deduplica --------------------------------------------------------------
  // A mesma foto aparece com e sem `.webp` (dois <img> para o mesmo produto).
  // Agrupa pela URL sem a extensao e fica com a de maior resolucao.
  const porBase = new Map();
  for (const a of achados) {
    const base = a.foto.replace(/\.(webp|jpe?g|png|avif)$/i, '').split('?')[0];
    const atual = porBase.get(base);
    if (!atual || a.w * a.h > atual.w * atual.h) porBase.set(base, a);
  }
  const itens = [...porBase.values()];

  log(`${achados.length} imagem(ns) na pagina → ${itens.length} depois de deduplicar.`);

  // Mesmo nome com fotos diferentes: nao da para escolher sozinho.
  const porNome = new Map();
  for (const i of itens) {
    const k = i.nome.trim().toLowerCase();
    porNome.set(k, (porNome.get(k) || 0) + 1);
  }
  const ambiguos = [...porNome].filter(([, n]) => n > 1).map(([k]) => k);
  if (ambiguos.length) {
    console.warn('Nome repetido com fotos diferentes (escolha uma antes de importar):', ambiguos);
  }

  // --- resolucao --------------------------------------------------------------
  const areas = itens.map((i) => i.w).sort((a, b) => a - b);
  const menor = areas[0];
  const mediana = areas[Math.floor(areas.length / 2)];
  const maior = areas[areas.length - 1];
  log(`Resolucao (largura): menor ${menor}px · mediana ${mediana}px · maior ${maior}px`, '#1a6b3c');
  if (mediana < 400) {
    console.warn(
      `Mediana de ${mediana}px e baixa para card de produto. As fotos sao essas mesmo ` +
        `no Anota AI — nao da para inventar resolucao que nao existe no arquivo original.`
    );
  }

  console.table(itens.map(({ nome, w, h }) => ({ nome, resolucao: `${w}x${h}` })));

  // --- baixa cada uma ---------------------------------------------------------
  log(`Baixando ${itens.length} foto(s)...`);

  async function comoDataUrl(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('nao consegui ler o blob'));
      fr.readAsDataURL(blob);
    });
  }

  // Plano A: fetch. Plano B: desenhar a <img> ja carregada num canvas — so
  // funciona se o CDN mandar CORS, senao o canvas fica "tainted" e o toDataURL
  // lanca. Um dos dois costuma passar.
  async function baixar(item) {
    try {
      const r = await fetch(item.foto, { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await comoDataUrl(await r.blob());
    } catch (e1) {
      try {
        const img = [...document.images].find((i) => (i.currentSrc || i.src) === item.foto);
        if (!img) throw new Error('imagem nao esta mais na pagina');
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png');
      } catch (e2) {
        throw new Error(`fetch: ${e1.message} | canvas: ${e2.message}`);
      }
    }
  }

  const prontos = [];
  const falhas = [];
  for (const [n, item] of itens.entries()) {
    try {
      item.dados = await baixar(item);
      prontos.push(item);
    } catch (e) {
      falhas.push({ nome: item.nome, foto: item.foto, motivo: e.message });
    }
    if ((n + 1) % 10 === 0) log(`  ${n + 1}/${itens.length}...`, '#666');
  }

  log(`${prontos.length} baixada(s), ${falhas.length} falha(s).`);
  if (falhas.length) console.table(falhas);

  if (!prontos.length) {
    console.warn('Nenhuma foto baixou. Me mande o erro da tabela acima.');
    return;
  }

  const payload = {
    origem: location.href,
    coletadoEm: new Date().toISOString(),
    itens: prontos,
    falhas,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const mb = (blob.size / 1024 / 1024).toFixed(1);

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fotos-anota.json';
  a.click();
  URL.revokeObjectURL(a.href);

  log(`fotos-anota.json (${mb} MB) baixado. Mova para a pasta do projeto.`);
})();
