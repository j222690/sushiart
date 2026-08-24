/**
 * PARTE 2 de 2 — baixa as fotos coletadas, casa com os produtos e sobe.
 *
 *   node scripts/importar-fotos.mjs fotos-anota.json            # so mostra o casamento
 *   node scripts/importar-fotos.mjs fotos-anota.json --aplicar  # sobe e grava image_url
 *   node scripts/importar-fotos.mjs fotos-anota.json --aplicar --sobrescrever
 *
 * Precisa da service role key (a anon nao escreve em products nem no bucket):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."   # Supabase > Settings > API
 *
 * Sem --aplicar nada e tocado: ele imprime a tabela do que casou, do que ficou
 * duvidoso e do que sobrou, para voce conferir antes de escrever no banco.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { casar } from './casar-nomes.mjs';

const BUCKET = 'menu';
const PASTA = 'produtos';
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const TAMANHO_MAX = 5 * 1024 * 1024; // mesmo limite do bucket e do uploadImage

const [, , arquivo, ...flags] = process.argv;
const aplicar = flags.includes('--aplicar');
const sobrescrever = flags.includes('--sobrescrever');

if (!arquivo) {
  console.error('Uso: node scripts/importar-fotos.mjs fotos-anota.json [--aplicar] [--sobrescrever]');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error('Faltou VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const db = createClient(url, chave, { auth: { persistSession: false } });

// --- carrega os dois lados ---------------------------------------------------

const { itens } = JSON.parse(readFileSync(arquivo, 'utf8'));
const { data: produtos, error } = await db
  .from('products')
  .select('id, name, image_url')
  .order('name');

if (error) {
  console.error('Nao consegui ler products:', error.message);
  process.exit(1);
}

console.log(`${itens.length} foto(s) coletadas  x  ${produtos.length} produto(s) no banco\n`);
const { casados, fotosUsadas } = casar(produtos, itens);

const comFoto = produtos.filter((p) => casados.has(p.id));
const semFoto = produtos.filter((p) => !casados.has(p.id));
const fotosSobrando = itens.filter((it) => !fotosUsadas.has(it.foto));

console.log('=== CASARAM ===');
for (const p of comFoto) {
  const { item, score } = casados.get(p.id);
  const marca = p.image_url && !sobrescrever ? ' [ja tem foto, pulando]' : '';
  console.log(`  ${(score * 100).toFixed(0).padStart(3)}%  ${p.name}  <-  ${item.nome}${marca}`);
}

console.log(`\n=== SEM FOTO (${semFoto.length}) ===`);
for (const p of semFoto) console.log(`  ${p.name}`);

console.log(`\n=== FOTOS QUE NAO CASARAM (${fotosSobrando.length}) ===`);
for (const it of fotosSobrando) console.log(`  ${it.nome}`);

if (!aplicar) {
  console.log('\nNada foi alterado. Confira a lista acima e rode de novo com --aplicar.');
  process.exit(0);
}

// --- baixa, sobe, grava ------------------------------------------------------

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
    const resp = await fetch(item.foto);
    if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);

    const tipo = (resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!TIPOS_OK.includes(tipo)) throw new Error(`tipo nao aceito: ${tipo || 'desconhecido'}`);

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength > TAMANHO_MAX) {
      throw new Error(`${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, acima do limite de 5 MB`);
    }

    const ext = tipo.split('/')[1].replace('jpeg', 'jpg');
    const caminho = `${PASTA}/${crypto.randomUUID()}.${ext}`;

    const { error: erroUpload } = await db.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: tipo, cacheControl: '31536000', upsert: false });
    if (erroUpload) throw new Error(`upload: ${erroUpload.message}`);

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);

    const { error: erroUpdate } = await db
      .from('products')
      .update({ image_url: pub.publicUrl })
      .eq('id', p.id);
    if (erroUpdate) throw new Error(`update: ${erroUpdate.message}`);

    console.log(`  ok      ${p.name}`);
    ok++;
  } catch (e) {
    console.log(`  FALHOU  ${p.name} — ${e.message}`);
    falhas++;
  }
}

console.log(`\n${ok} enviada(s), ${pulados} pulada(s) por ja ter foto, ${falhas} falha(s).`);
if (semFoto.length) {
  console.log(`${semFoto.length} produto(s) seguem sem foto — suba na mao em /admin/cardapio.`);
}
