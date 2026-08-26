/**
 * Reduz as fotos ja publicadas, sem passar pela OpenAI de novo.
 *
 *   node scripts/encolher-fotos.mjs            # so mostra o que faria
 *   node scripts/encolher-fotos.mjs --aplicar
 *
 * Por que: as retocadas sairam com 640 px e ate 121 kB, mas o card do cardapio
 * exibe a 128 px de altura e a ficha do produto a 224 px. Medido com CPU e rede
 * de celular, a tela do cardapio baixava 2,3 MB so de imagem — o suficiente
 * para engasgar a rolagem num 4G de rua.
 *
 * 400 px cobre a maior exibicao (224 px) com folga em tela 2x, e a diferenca nao
 * se ve. O arquivo antigo continua no Storage, entao desfazer e restaurar o
 * backup da coluna.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const BUCKET = 'menu';
const PASTA = 'produtos-leves';
const LADO = 400;
const QUALIDADE = 0.78;

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
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave?.startsWith('eyJ')) {
  console.error('Faltou VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (comeca com "eyJ").');
  process.exit(1);
}

const aplicar = process.argv.includes('--aplicar');
const db = createClient(url, chave, { auth: { persistSession: false } });

const { data: produtos, error } = await db
  .from('products')
  .select('id, name, image_url')
  .not('image_url', 'is', null)
  .order('name');

if (error) {
  console.error('Nao consegui ler products:', error.message);
  process.exit(1);
}

// So o que este projeto gerou. Foto que veio do Anota AI ja e 200 px e leve;
// passar ela por aqui so perderia qualidade sem ganhar peso.
const alvos = produtos.filter((p) => /produtos-retocados/.test(p.image_url));
console.log(`${produtos.length} com foto · ${alvos.length} retocada(s) a encolher\n`);

if (!alvos.length) {
  console.log('Nada a fazer.');
  process.exit(0);
}

const browser = await chromium.launch();
const pagina = await (await browser.newContext()).newPage();
await pagina.goto('about:blank');

let antes = 0;
let depois = 0;
let ok = 0;
let falhas = 0;

for (const [i, p] of alvos.entries()) {
  try {
    const r = await fetch(p.image_url);
    if (!r.ok) throw new Error(`baixar: HTTP ${r.status}`);
    const original = Buffer.from(await r.arrayBuffer());
    antes += original.length;

    const menorB64 = await pagina.evaluate(
      async ([b64, lado, q]) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error('nao decodificou'));
          img.src = `data:image/webp;base64,${b64}`;
        });
        const c = document.createElement('canvas');
        c.width = lado;
        c.height = lado;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, lado, lado);
        return c.toDataURL('image/webp', q).split(',')[1];
      },
      [original.toString('base64'), LADO, QUALIDADE]
    );

    const bytes = Buffer.from(menorB64, 'base64');
    depois += bytes.length;

    if (!aplicar) {
      console.log(`  ${p.name}  ${(original.length / 1024).toFixed(0)} kB -> ${(bytes.length / 1024).toFixed(0)} kB`);
      ok++;
      continue;
    }

    const caminho = `${PASTA}/${crypto.randomUUID()}.webp`;
    const { error: eUp } = await db.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (eUp) throw new Error(`upload: ${eUp.message}`);

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const { error: eDb } = await db.from('products').update({ image_url: pub.publicUrl }).eq('id', p.id);
    if (eDb) throw new Error(`update: ${eDb.message}`);

    console.log(`  ${i + 1}/${alvos.length}  ok  ${p.name}  ${(original.length / 1024).toFixed(0)} kB -> ${(bytes.length / 1024).toFixed(0)} kB`);
    ok++;
  } catch (e) {
    falhas++;
    console.log(`  FALHOU  ${p.name} — ${e.message}`);
  }
}

await browser.close();

console.log(`\n${ok} processada(s), ${falhas} falha(s).`);
console.log(`peso do cardapio: ${(antes / 1024 / 1024).toFixed(2)} MB -> ${(depois / 1024 / 1024).toFixed(2)} MB`);
if (!aplicar) console.log('\nNada foi alterado. Rode com --aplicar para valer.');
