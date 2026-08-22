import { chromium } from 'playwright';

// Porta cravada no codigo ja produziu falso "tudo certo": outro projeto subiu
// na 5173, o Vite jogou este app na 5174, e o smoke aprovou a aplicacao errada.
// Confira a porta que o `npm run dev` imprimiu e passe em SMOKE_BASE.
const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';
const OUT = process.argv[2] || '.';

const PAGES = [
  ['/', 'home'],
  ['/cardapio', 'cardapio'],
  ['/ofertas', 'ofertas'],
  ['/busca', 'busca'],
  ['/carrinho', 'carrinho'],
  ['/pedidos', 'pedidos'],
  ['/perfil', 'perfil'],
  ['/entrar', 'entrar'],
  ['/admin', 'admin-redirect'],
  ['/admin/entrar', 'admin-login'],
];

// Trava de identidade: sem isso o script aprova qualquer coisa que atenda na porta.
const ESPERADO = /Sushi Art/i;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
let falhas = 0;

for (const [path, nome] of PAGES) {
  const page = await ctx.newPage();
  const erros = [];

  // Erro de JS em tempo de execução — é isso que o build não pega.
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    if (!/ERR_ABORTED/.test(f)) erros.push(`rede: ${r.url().slice(0, 80)} ${f}`);
  });

  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 25000 });
    // A splash tem 900ms mínimos; espera ela sair antes de julgar a tela.
    await page.waitForTimeout(2200);

    const titulo = await page.title();
    if (!ESPERADO.test(titulo)) {
      throw new Error(`${BASE} nao e o Sushi Art (title: "${titulo}"). Confira SMOKE_BASE.`);
    }

    const texto = (await page.locator('body').innerText()).trim();
    const url = new URL(page.url()).pathname;
    await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: false });

    // Tela em branco é falha de render, mesmo com HTTP 200.
    if (texto.length < 20) erros.push(`TELA VAZIA (${texto.length} chars)`);

    const status = erros.length ? 'FALHOU' : 'ok';
    if (erros.length) falhas += 1;
    console.log(`${status.padEnd(7)} ${path.padEnd(16)} -> ${url.padEnd(16)} ${texto.length} chars`);
    for (const e of erros) console.log(`        ${e}`);
    if (!erros.length) console.log(`        "${texto.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 110)}"`);
  } catch (e) {
    falhas += 1;
    console.log(`FALHOU  ${path} -> ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await browser.close();
console.log(falhas ? `\n${falhas} pagina(s) com problema.` : '\nTodas as paginas renderizaram limpas.');
