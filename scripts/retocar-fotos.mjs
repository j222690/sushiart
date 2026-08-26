/**
 * Passa as fotos do cardapio pela OpenAI, comprime e sobe por cima.
 *
 *   node scripts/retocar-fotos.mjs --so 3     # ensaio: so os 3 primeiros
 *   node scripts/retocar-fotos.mjs            # todos
 *
 * Antes de rodar: `node scripts/backup-fotos.mjs`, que guarda os image_url
 * atuais. Nada e apagado do Storage, entao desfazer e so restaurar a coluna.
 *
 * Retoma de onde parou: cada sucesso e anotado em `retoque-feitos.json`, e uma
 * nova execucao pula quem ja esta la. Sao ~40 s por foto e a conexao pode cair
 * no meio — nao da para depender de uma execucao unica sair inteira.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const BUCKET = 'menu';
const PASTA = 'produtos-retocados';
const REGISTRO = 'retoque-feitos.json';

// A OpenAI devolve PNG de 1024x1024 com ~2 MB. A ficha do produto exibe a
// 224 px de altura; subir 2 MB para isso deixaria o cardapio pesado no 4G, que
// e exatamente o problema que os webp de 8 kB evitavam. 640 px em webp cobre a
// maior exibicao com folga em tela 3x e cabe em algumas dezenas de kB.
const LADO_FINAL = 640;
const QUALIDADE = 0.82;

const PROMPT = [
  'Melhore a nitidez e a resolucao desta fotografia de comida japonesa.',
  'Mantenha as cores naturais e realistas do salmao fresco: rosa-alaranjado suave,',
  'com as linhas brancas de gordura (marmoreio) bem visiveis. Nao sature as cores.',
  'Deve parecer uma fotografia real de peixe cru, nao um modelo de plastico.',
].join(' ');

function carregarEnv(caminho = '.env') {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(linha);
    if (!m) continue;
    const valor = m[2].trim().replace(/^["']|["']$/g, '');
    if (valor && !process.env[m[1]]) process.env[m[1]] = valor;
  }
}
carregarEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
const chaveIA = process.env.OPENAI_API_KEY;

if (!url || !chaveDb?.startsWith('eyJ')) {
  console.error('Faltou VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (comeca com "eyJ").');
  process.exit(1);
}
if (!chaveIA) {
  console.error('Faltou OPENAI_API_KEY no ambiente.');
  process.exit(1);
}

const iSo = process.argv.indexOf('--so');
const limite = iSo === -1 ? Infinity : Number(process.argv[iSo + 1]) || Infinity;

const db = createClient(url, chaveDb, { auth: { persistSession: false } });

const feitos = existsSync(REGISTRO) ? JSON.parse(readFileSync(REGISTRO, 'utf8')) : {};

// Bebida nao passa por aqui. Testado com as duas aguas Crystal: o modelo
// reescreve o rotulo em letra sem sentido ("egiia mineral"), troca o desenho da
// embalagem e chega a inventar cenario. Prato preparado ele respeita; texto
// impresso, nao — e ainda por cima o rotulo e marca de terceiro.
const { data: categorias, error: eCat } = await db.from('categories').select('id, slug, name');
if (eCat) {
  console.error('Nao consegui ler categories:', eCat.message);
  process.exit(1);
}
const pular = new Set(
  categorias.filter((c) => /bebida|refrigerante|agua/i.test(`${c.slug} ${c.name}`)).map((c) => c.id)
);

const { data: produtos, error } = await db
  .from('products')
  .select('id, name, image_url, category_id')
  .not('image_url', 'is', null)
  .order('name');

if (error) {
  console.error('Nao consegui ler products:', error.message);
  process.exit(1);
}

const embalados = produtos.filter((p) => pular.has(p.category_id));
if (embalados.length) {
  console.log(`pulando ${embalados.length} item(ns) de embalagem: ${embalados.map((p) => p.name).join(', ')}\n`);
}

const elegiveis = produtos.filter((p) => !pular.has(p.category_id));
const fila = elegiveis.filter((p) => !feitos[p.id]).slice(0, limite);
console.log(`${elegiveis.length} prato(s) elegivel(is) · ${Object.keys(feitos).length} ja retocado(s) · ${fila.length} na fila\n`);

if (!fila.length) {
  console.log('Nada a fazer.');
  process.exit(0);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const pagina = await ctx.newPage();
await pagina.goto('about:blank');

/**
 * Redimensiona e converte para webp usando o proprio Chromium, que ja esta
 * aberto — evita dependencia nova so para isso, e o encoder e o mesmo que os
 * navegadores dos clientes usam para decodificar.
 */
async function comprimir(pngBase64) {
  return pagina.evaluate(
    async ([b64, lado, q]) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('nao decodificou o png'));
        img.src = `data:image/png;base64,${b64}`;
      });
      const c = document.createElement('canvas');
      c.width = lado;
      c.height = lado;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, lado, lado);
      return c.toDataURL('image/webp', q).split(',')[1];
    },
    [pngBase64, LADO_FINAL, QUALIDADE]
  );
}

let ok = 0;
let falhas = 0;
let bytesTotal = 0;
const t0 = Date.now();

for (const [i, p] of fila.entries()) {
  const posicao = `${i + 1}/${fila.length}`;
  try {
    // A foto atual ja esta no nosso Storage e e publica: fetch comum resolve.
    const rOrig = await fetch(p.image_url);
    if (!rOrig.ok) throw new Error(`baixar atual: HTTP ${rOrig.status}`);
    const tipoOrig = (rOrig.headers.get('content-type') || 'image/webp').split(';')[0];
    const original = Buffer.from(await rOrig.arrayBuffer());

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', PROMPT);
    form.append('size', '1024x1024');
    form.append('input_fidelity', 'high');
    form.append('image', new Blob([original], { type: tipoOrig }), `foto.${tipoOrig.split('/')[1]}`);

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chaveIA}` },
      body: form,
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${json.error?.message || ''}`.slice(0, 160));

    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error('resposta sem imagem');

    const webpB64 = await comprimir(b64);
    const bytes = Buffer.from(webpB64, 'base64');

    const caminho = `${PASTA}/${crypto.randomUUID()}.webp`;
    const { error: eUp } = await db.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (eUp) throw new Error(`upload: ${eUp.message}`);

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const { error: eDb } = await db.from('products').update({ image_url: pub.publicUrl }).eq('id', p.id);
    if (eDb) throw new Error(`update: ${eDb.message}`);

    feitos[p.id] = { nome: p.name, anterior: p.image_url, novo: pub.publicUrl, em: new Date().toISOString() };
    writeFileSync(REGISTRO, JSON.stringify(feitos, null, 2));

    bytesTotal += bytes.length;
    ok++;
    console.log(`  ${posicao}  ok      ${p.name}  (${(original.length / 1024).toFixed(0)} kB -> ${(bytes.length / 1024).toFixed(0)} kB)`);
  } catch (e) {
    falhas++;
    console.log(`  ${posicao}  FALHOU  ${p.name} — ${e.message}`);
  }
}

await browser.close();

const min = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${ok} retocada(s), ${falhas} falha(s), em ${min} min.`);
if (ok) console.log(`peso medio final: ${(bytesTotal / ok / 1024).toFixed(0)} kB por foto`);
if (falhas) console.log('Rode de novo para tentar so as que falharam — as que deram certo sao puladas.');
