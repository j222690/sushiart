/**
 * Guarda o `image_url` atual de cada produto num arquivo, para dar como
 * desfazer qualquer troca de fotos em massa.
 *
 *   node scripts/backup-fotos.mjs                       # grava o backup
 *   node scripts/backup-fotos.mjs --restaurar arq.json  # volta ao que estava
 *
 * O arquivo antigo continua no Storage — nada e apagado —, entao restaurar e so
 * reescrever a coluna.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  console.error('Faltou VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (a chave comeca com "eyJ").');
  process.exit(1);
}

const db = createClient(url, chave, { auth: { persistSession: false } });

const iRestaurar = process.argv.indexOf('--restaurar');

if (iRestaurar === -1) {
  const { data, error } = await db.from('products').select('id, name, image_url').order('name');
  if (error) {
    console.error('Nao consegui ler products:', error.message);
    process.exit(1);
  }

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const arquivo = `backup-fotos-${carimbo}.json`;
  writeFileSync(arquivo, JSON.stringify({ feitoEm: new Date().toISOString(), produtos: data }, null, 2));

  const com = data.filter((p) => p.image_url).length;
  console.log(`${arquivo}`);
  console.log(`  ${data.length} produto(s), ${com} com foto`);
  console.log(`\nPara desfazer depois:  node scripts/backup-fotos.mjs --restaurar ${arquivo}`);
} else {
  const arquivo = process.argv[iRestaurar + 1];
  if (!arquivo) {
    console.error('Diga qual arquivo restaurar: --restaurar backup-fotos-....json');
    process.exit(1);
  }

  const { produtos } = JSON.parse(readFileSync(arquivo, 'utf8'));
  let ok = 0;
  let falhas = 0;

  for (const p of produtos) {
    const { error } = await db.from('products').update({ image_url: p.image_url }).eq('id', p.id);
    if (error) {
      console.log(`  FALHOU ${p.name}: ${error.message}`);
      falhas++;
    } else ok++;
  }
  console.log(`${ok} produto(s) restaurado(s), ${falhas} falha(s).`);
}
