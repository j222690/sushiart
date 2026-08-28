/**
 * Gera o par de chaves VAPID do Web Push e escreve num arquivo local.
 *
 *   node scripts/gerar-vapid.mjs
 *
 * Escreve em `vapid.txt` (ignorado pelo git) em vez de imprimir na tela: a
 * chave privada assina os pushes em nome do restaurante, e mensagem de terminal
 * acaba colada em conversa sem querer.
 *
 * Não usa dependência: o Node já sabe gerar P-256, que é a curva que o Web Push
 * exige (RFC 8292).
 */
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// A pública vai no formato "uncompressed point": 0x04 || x || y, 65 bytes.
// É esse o formato que o navegador espera em applicationServerKey e que a
// função do Deno decompõe em x e y para montar o JWK.
// `publicKey` já é um KeyObject público; passá-lo por createPublicKey lança.
const jwkPub = publicKey.export({ format: 'jwk' });
const x = Buffer.from(jwkPub.x, 'base64url');
const y = Buffer.from(jwkPub.y, 'base64url');
const publicaB64 = b64url(Buffer.concat([Buffer.from([4]), x, y]));

const jwkPriv = privateKey.export({ format: 'jwk' });
const privadaB64 = b64url(Buffer.from(jwkPriv.d, 'base64url'));

if (publicaB64.length !== 87) {
  console.error(`A chave pública saiu com ${publicaB64.length} caracteres; o esperado são 87.`);
  process.exit(1);
}

const arquivo = 'vapid.txt';
if (existsSync(arquivo)) {
  console.error(`${arquivo} já existe. Apague antes se quiser gerar um par novo.`);
  console.error('Trocar de par invalida as inscrições já feitas: cada aparelho precisa autorizar de novo.');
  process.exit(1);
}

writeFileSync(
  arquivo,
  [
    '# Par de chaves VAPID do Sushi Art — gerado em ' + new Date().toISOString(),
    '# A privada é segredo: nunca vá para o git, para o navegador, nem para conversa.',
    '',
    'VAPID_PUBLIC_KEY=' + publicaB64,
    'VAPID_PRIVATE_KEY=' + privadaB64,
    '',
    '# A pública vai TAMBÉM no .env do app, como VITE_VAPID_PUBLIC_KEY —',
    '# tem que ser exatamente a mesma, senão o navegador se inscreve num par',
    '# e o servidor assina com outro, e o push é recusado sem erro visível.',
  ].join('\n')
);

console.log(`Par gerado em ${arquivo}`);
console.log(`  pública : ${publicaB64.length} caracteres, começa com "${publicaB64.slice(0, 12)}…"`);
console.log(`  privada : ${privadaB64.length} caracteres (não mostrada)`);
