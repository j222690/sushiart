/**
 * PARTE 2 de 2 — baixa as fotos, casa com os produtos e sobe.
 *
 *   node scripts/importar-fotos.mjs fotos-anota.json            # so mostra o casamento
 *   node scripts/importar-fotos.mjs fotos-anota.json --aplicar  # baixa, sobe e grava
 *   node scripts/importar-fotos.mjs fotos-anota.json --aplicar --sobrescrever
 *
 * Precisa da service role key (a anon nao escreve em products nem no bucket):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."   # Supabase > Settings > API
 *
 * Sem --aplicar nada e tocado nem baixado: so imprime o casamento para conferir.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { casar, semelhanca } from './casar-nomes.mjs';

// O `.env` do projeto ja tem a URL do Supabase, mas quem le aquilo e o Vite, no
// build do app — o Node nao le sozinho. Sem isto voce teria que exportar a URL
// na mao toda vez, mesmo ela estando ali do lado.
// A chave de service role NAO fica no .env de proposito: ela nunca deve chegar
// ao navegador, e tudo que comeca com VITE_ vai junto no bundle.
function carregarEnv(caminho = '.env') {
  if (!existsSync(caminho)) return;
  // Split em /\r?\n/, nao em '\n': num arquivo com quebra de linha do Windows
  // sobraria um \r no fim da linha, e `.` em regex de JS nao casa com \r — o
  // `(.*)$` falharia em toda linha e o .env parecia vazio.
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(linha);
    if (!m) continue;
    const valor = m[2].trim().replace(/^["']|["']$/g, '');
    if (valor && !process.env[m[1]]) process.env[m[1]] = valor;
  }
}
carregarEnv();

const BUCKET = 'menu';
const PASTA = 'produtos';
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const TAMANHO_MAX = 5 * 1024 * 1024; // mesmo limite do bucket e do uploadImage
const REFERER = 'https://pedido.anota.ai/';

const [, , arquivo, ...flags] = process.argv;
const aplicar = flags.includes('--aplicar');
const sobrescrever = flags.includes('--sobrescrever');

if (!arquivo) {
  console.error('Uso: node scripts/importar-fotos.mjs fotos-anota.json [--aplicar] [--sobrescrever]');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('Faltou VITE_SUPABASE_URL no ambiente (ou no .env).');
  process.exit(1);
}
if (!chave) {
  console.error('Faltou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # Supabase > Settings > API');
  process.exit(1);
}
// Confundir a chave com a URL do projeto e o erro mais facil de cometer aqui, e
// sem esta checagem o createClient so falha la na frente, com mensagem obscura.
if (!chave.startsWith('eyJ')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY nao parece uma chave.');
  console.error(`  recebi: ${chave.slice(0, 40)}${chave.length > 40 ? '...' : ''}`);
  console.error('  a chave e um texto longo comecando com "eyJ", nao o endereco do projeto.');
  console.error('  Supabase > Settings > API > service_role > Reveal');
  process.exit(1);
}

const db = createClient(url, chave, { auth: { persistSession: false } });

// --- limpa o que veio da pagina ----------------------------------------------

/**
 * A mesma foto aparece em duas URLs: uma sem extensao e outra com `.webp`.
 * Medi as duas — tem exatamente os mesmos pixels (200x200); a sem extensao vem
 * como PNG de ~110 kB e a `.webp` como ~8 kB. Mesma imagem, 14x mais leve.
 * Fica com a `.webp`: o cliente carrega o cardapio no 4G da rua.
 */
function limpar(itens) {
  const porBase = new Map();
  for (const it of itens) {
    // O placeholder "sem imagem" deles. Nao serve, e ainda por cima mora no
    // dominio protegido por Cloudflare, entao o download levaria 403. Nosso
    // fallback com a marca e melhor do que um cinza generico.
    if (/item_no_image/i.test(it.foto)) continue;

    const base = it.foto.replace(/\.(webp|jpe?g|png|avif)$/i, '').split('?')[0];
    const atual = porBase.get(base);
    if (!atual || (!/\.webp$/i.test(atual.foto) && /\.webp$/i.test(it.foto))) {
      porBase.set(base, it);
    }
  }
  return [...porBase.values()];
}

// --- carrega os dois lados ---------------------------------------------------

const brutos = JSON.parse(readFileSync(arquivo, 'utf8')).itens;
const itens = limpar(brutos);

const { data: produtos, error } = await db.from('products').select('id, name, image_url').order('name');
if (error) {
  console.error('Nao consegui ler products:', error.message);
  process.exit(1);
}

console.log(
  `${brutos.length} foto(s) no arquivo → ${itens.length} depois de tirar as repetidas` +
    `   x   ${produtos.length} produto(s) no banco\n`
);

const { casados, fotosUsadas } = casar(produtos, itens);

const comFoto = produtos.filter((p) => casados.has(p.id));
const semFoto = produtos.filter((p) => !casados.has(p.id));
const fotosSobrando = itens.filter((it) => !fotosUsadas.has(it.foto));

console.log(`=== CASARAM (${comFoto.length}) ===`);
for (const p of comFoto) {
  const { item, score } = casados.get(p.id);
  const marca = p.image_url && !sobrescrever ? ' [ja tem foto, pulando]' : '';
  console.log(`  ${(score * 100).toFixed(0).padStart(3)}%  ${p.name}  <-  ${item.nome}${marca}`);
}

// Mostra o melhor quase-par de cada um. Diferenca de grafia entre os dois
// sistemas ("Suzuka" no banco, "Suzuca" na loja) para em 50% e nao entra — de
// proposito, porque foto errada num produto e pior que foto faltando: o cliente
// ve. Aqui voce enxerga o caso e resolve na mao.
console.log(`\n=== SEM FOTO (${semFoto.length}) ===`);
for (const p of semFoto) {
  let melhor = { nome: null, score: 0 };
  for (const it of itens) {
    const score = semelhanca(p.name, it.nome);
    if (score > melhor.score) melhor = { nome: it.nome, score };
  }
  console.log(
    `  ${p.name}` +
      (melhor.nome ? `   (mais parecida: ${(melhor.score * 100).toFixed(0)}% "${melhor.nome}")` : '   (nada parecido)')
  );
}

console.log(`\n=== FOTOS SEM DONO (${fotosSobrando.length}) ===`);
for (const it of fotosSobrando) console.log(`  ${it.nome}`);

// --- baixa, sobe, grava ------------------------------------------------------

// Sem `--aplicar` o trabalho acaba aqui. Nada de `process.exit(0)`: sair com o
// cliente do Supabase ainda de pe faz o libuv abortar no Windows
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), o que suja a tela
// e devolve codigo de erro depois de uma execucao que deu certo.
if (!aplicar) {
  console.log('\nNada foi baixado nem alterado. Confira a lista e rode de novo com --aplicar.');
} else {

  /**
   * O download tem que sair de um navegador de verdade. Requisicao comum leva 403
   * do CDN (testado com GET, User-Agent de Chrome e Referer), e do lado da pagina
   * o `fetch` esbarra em CORS. Indo direto na URL da imagem com o Playwright,
   * passa.
   */
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  console.log('\n=== APLICANDO ===');
  let ok = 0;
  let pulados = 0;
  let falhas = 0;

  for (const p of comFoto) {
    const { item } = casados.get(p.id);

    if (p.image_url && !sobrescrever) {
      pulados++;
      continue;
    }

    try {
      const resp = await ctx.request.get(item.foto, { headers: { referer: REFERER } });
      if (!resp.ok()) throw new Error(`download HTTP ${resp.status()}`);

      const tipo = (resp.headers()['content-type'] || '').split(';')[0].trim();
      if (!TIPOS_OK.includes(tipo)) throw new Error(`tipo nao aceito: ${tipo || 'desconhecido'}`);

      const bytes = await resp.body();
      if (bytes.length > TAMANHO_MAX) {
        throw new Error(`${(bytes.length / 1024 / 1024).toFixed(1)} MB, acima do limite de 5 MB`);
      }

      const ext = tipo.split('/')[1].replace('jpeg', 'jpg');
      const caminho = `${PASTA}/${crypto.randomUUID()}.${ext}`;

      const { error: erroUpload } = await db.storage
        .from(BUCKET)
        .upload(caminho, bytes, { contentType: tipo, cacheControl: '31536000', upsert: false });
      if (erroUpload) throw new Error(`upload: ${erroUpload.message}`);

      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);

      const { error: erroUpdate } = await db.from('products').update({ image_url: pub.publicUrl }).eq('id', p.id);
      if (erroUpdate) throw new Error(`update: ${erroUpdate.message}`);

      console.log(`  ok      ${p.name}  (${(bytes.length / 1024).toFixed(0)} kB)`);
      ok++;
    } catch (e) {
      console.log(`  FALHOU  ${p.name} — ${e.message}`);
      falhas++;
    }
  }

  await browser.close();

  console.log(`\n${ok} enviada(s), ${pulados} pulada(s) por ja ter foto, ${falhas} falha(s).`);
  if (semFoto.length) {
    console.log(`${semFoto.length} produto(s) seguem sem foto — suba na mao em /admin/cardapio.`);
  }
}
