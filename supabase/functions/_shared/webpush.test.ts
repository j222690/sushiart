/**
 * Confere a criptografia do push contra o vetor de teste oficial —
 * RFC 8291, seção 5 ("Push Message Encryption Example").
 *
 * Round-trip (cifrar e decifrar com o próprio código) não serviria aqui: se eu
 * tivesse entendido o RFC errado, os dois lados errariam igual e o teste
 * passaria. Comparar com a saída publicada no RFC é o que realmente prova que
 * um navegador de verdade vai conseguir abrir a mensagem.
 *
 * Rodar:  node supabase/functions/_shared/webpush.test.ts
 */

import { b64urlToBytes, bytesToB64url, encryptPayload, vapidHeader } from './webpush.ts';

// --- Vetor do RFC 8291 §5 ---------------------------------------------------
const PLAINTEXT = 'When I grow up, I want to be a watermelon';

const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH_SECRET = 'BTBZMqHH6r4Tts7J_aSIgg';

const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';

const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';

const ESPERADO =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
  'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
  'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

// ---------------------------------------------------------------------------
async function importarParEfemero(): Promise<CryptoKeyPair> {
  const publicRaw = b64urlToBytes(AS_PUBLIC);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(publicRaw.slice(1, 33)),
    y: bytesToB64url(publicRaw.slice(33, 65)),
    ext: true,
  };

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, d: AS_PRIVATE },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const publicKey = await crypto.subtle.importKey(
    'raw',
    publicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  return { privateKey, publicKey };
}

const corpo = await encryptPayload(
  {
    endpoint: 'https://exemplo.invalido/push',
    keys: { p256dh: UA_PUBLIC, auth: AUTH_SECRET },
  },
  new TextEncoder().encode(PLAINTEXT),
  { salt: b64urlToBytes(SALT), keyPair: await importarParEfemero() }
);

const obtido = bytesToB64url(corpo);

let falhas = 0;

if (obtido === ESPERADO) {
  console.log('ok      RFC 8291 §5 — corpo cifrado bate com o vetor do RFC');
  console.log(`        ${corpo.length} bytes`);
} else {
  falhas += 1;
  console.error('FALHOU  o corpo cifrado nao bate com o vetor do RFC 8291.');
  console.error(`        esperado: ${ESPERADO}`);
  console.error(`        obtido:   ${obtido}`);
}

// ---------------------------------------------------------------------------
// VAPID (RFC 8292) — não há vetor publicado, então a prova aqui é outra:
// assinar com a chave privada e conferir a assinatura com a PÚBLICA. Se o JWK
// que montamos a partir do par do `web-push` estivesse errado, a verificação
// falharia — que é exatamente o que o push service faria do outro lado.
// ---------------------------------------------------------------------------
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

const publicaRaw = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
const jwkPrivada = await crypto.subtle.exportKey('jwk', par.privateKey);

const cabecalho = await vapidHeader(
  'https://fcm.googleapis.com/fcm/send/abc123',
  bytesToB64url(publicaRaw),
  jwkPrivada.d!,
  'mailto:contato@sushiart.com.br'
);

const jwt = cabecalho.match(/t=([^,]+)/)?.[1] ?? '';
const [cabecalhoB64, claimsB64, assinaturaB64] = jwt.split('.');

const chaveVerificacao = await crypto.subtle.importKey(
  'raw',
  publicaRaw,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify']
);

const assinaturaOk = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  chaveVerificacao,
  b64urlToBytes(assinaturaB64),
  new TextEncoder().encode(`${cabecalhoB64}.${claimsB64}`)
);

const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(claimsB64)));
const algoritmo = JSON.parse(new TextDecoder().decode(b64urlToBytes(cabecalhoB64))).alg;

// `aud` tem que ser a ORIGEM do endpoint, não a URL inteira: push service que
// recebe o caminho junto rejeita o JWT.
const audienciaOk = claims.aud === 'https://fcm.googleapis.com';
const expiracaoOk = claims.exp > Math.floor(Date.now() / 1000);

if (assinaturaOk && audienciaOk && expiracaoOk && algoritmo === 'ES256') {
  console.log('ok      RFC 8292 — JWT VAPID assina e verifica com a chave pública');
  console.log(`        aud=${claims.aud} alg=${algoritmo}`);
} else {
  falhas += 1;
  console.error('FALHOU  JWT VAPID invalido.');
  console.error(
    `        assinatura=${assinaturaOk} aud=${claims.aud} exp_ok=${expiracaoOk} alg=${algoritmo}`
  );
}

if (falhas) process.exit(1);
console.log('\nCriptografia do push conferida.');
