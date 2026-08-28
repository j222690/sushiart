/**
 * Gera o segredo compartilhado entre o banco e a Edge Function do push, e
 * escreve num arquivo com os dois passos já prontos para colar.
 *
 *   node scripts/gerar-push-secret.mjs
 *
 * Por que gerar em vez de reaproveitar: segredo de Edge Function não pode ser
 * lido depois de salvo — o Supabase mostra só o nome e um resumo. Se o valor se
 * perdeu, não há como recuperá-lo, e substituir é inofensivo: ele é apenas uma
 * senha combinada entre quem chama (o gatilho do banco) e quem atende (a
 * função). O que não pode é os dois lados terem valores diferentes.
 *
 * Sai em arquivo, não na tela, pelo mesmo motivo do vapid.txt.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ARQUIVO = 'push-secret.txt';

if (existsSync(ARQUIVO)) {
  console.error(`${ARQUIVO} já existe. Apague antes se quiser gerar outro.`);
  process.exit(1);
}

// A URL da função sai do próprio .env, para não haver erro de digitação num
// endereço que o banco vai chamar sem ninguém ver o resultado.
let url = '';
try {
  const env = readFileSync('.env', 'utf8');
  const m = /^\s*VITE_SUPABASE_URL\s*=\s*(.+)$/m.exec(env);
  if (m) url = `${m[1].trim().replace(/\/+$/, '')}/functions/v1/send-push`;
} catch {
  // Sem .env: o arquivo sai com um lembrete no lugar da URL.
}

const segredo = randomBytes(32).toString('base64url');

writeFileSync(
  ARQUIVO,
  `# Segredo do push do Sushi Art — gerado em ${new Date().toISOString()}
# O MESMO valor precisa entrar nos dois lugares abaixo. Se divergirem, a função
# recusa o disparo com "Não autorizado" e nenhum push sai — sem erro visível no app.


# ── PASSO 1 · Supabase → Edge Functions → Secrets ──────────────────────────
# Crie (ou substitua) o segredo com este nome e valor:

PUSH_HOOK_SECRET=${segredo}


# ── PASSO 2 · Supabase → SQL Editor ────────────────────────────────────────
# Cole e execute. Sem estas duas linhas o gatilho não dispara nada — é de
# propósito, para instalação nova não quebrar ao criar o primeiro pedido.

insert into private.app_config (key, value) values
  ('push_function_url', '${url || 'https://SEU-PROJETO.supabase.co/functions/v1/send-push'}'),
  ('push_hook_secret',  '${segredo}')
on conflict (key) do update set value = excluded.value, updated_at = now();


# ── Conferir ───────────────────────────────────────────────────────────────
# Depois dos dois passos, faça um pedido de teste no app. O aparelho inscrito
# deve receber o aviso. Se não vier, o log mostra o motivo:
#   npx supabase functions logs send-push
`
);

console.log(`Pronto: ${ARQUIVO}`);
console.log('  Abra o arquivo e siga os dois passos. Ele está fora do git.');
console.log(`  URL da função: ${url || '(não achei VITE_SUPABASE_URL no .env)'}`);
