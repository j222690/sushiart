/**
 * Web Push (VAPID) escrito à mão sobre WebCrypto.
 *
 * Por que não usar a lib `web-push` do npm: ela depende de `node:crypto` e de
 * `node:https`, e o que roda aqui é Deno. As duas coisas que ela faz estão
 * especificadas em RFC e cabem neste arquivo:
 *
 *   RFC 8291 — criptografia da mensagem (ECDH P-256 + HKDF + AES-128-GCM)
 *   RFC 8292 — autenticação do remetente (JWT ES256 assinado com a chave VAPID)
 *
 * O corpo enviado ao push service é opaco para ele: só o navegador que assinou
 * consegue abrir. Nem o Google nem a Apple leem o texto da notificação.
 */

// ---------------------------------------------------------------------------
// base64url — o formato em que navegador e VAPID trocam chaves
// ---------------------------------------------------------------------------
export function b64urlToBytes(input: string): Uint8Array {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

// ---------------------------------------------------------------------------
// HKDF (RFC 5869). Todos os comprimentos usados aqui cabem em um bloco só de
// HMAC-SHA256 (<= 32 bytes), então o Expand é uma iteração única.
// ---------------------------------------------------------------------------
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const expanded = await hmac(prk, concat(info, Uint8Array.of(1)));
  return expanded.slice(0, length);
}

// ---------------------------------------------------------------------------
// A inscrição que o navegador entregou ao app e guardamos em `push_tokens`.
// ---------------------------------------------------------------------------
export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Criptografa o payload no esquema `aes128gcm` (RFC 8291 + RFC 8188).
 *
 * O resultado já é o corpo HTTP completo, com o cabeçalho binário que o
 * navegador precisa para derivar a mesma chave e decifrar:
 *
 *   salt(16) | tamanho do registro(4) | tamanho da chave(1) | chave efêmera(65) | cifra
 */
export async function encryptPayload(
  subscription: PushSubscription,
  plaintext: Uint8Array,
  /**
   * Só para teste: fixa o que normalmente é aleatório, para conseguir comparar
   * a saída com o vetor da seção 5 do RFC 8291. Em produção fica indefinido.
   */
  fixo?: { salt: Uint8Array; keyPair: CryptoKeyPair }
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);

  // Par efêmero: um por mensagem. Reaproveitar enfraqueceria o sigilo.
  const ephemeral =
    fixo?.keyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, ephemeral.privateKey, 256)
  );

  // Mistura o segredo ECDH com o `auth` da inscrição — é isso que amarra a
  // mensagem àquele navegador específico.
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(utf8('WebPush: info'), Uint8Array.of(0), uaPublicRaw, asPublicRaw),
    32
  );

  const salt = fixo?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(
    salt,
    ikm,
    concat(utf8('Content-Encoding: aes128gcm'), Uint8Array.of(0)),
    16
  );
  const nonce = await hkdf(salt, ikm, concat(utf8('Content-Encoding: nonce'), Uint8Array.of(0)), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);

  // 0x02 marca "último registro" no esquema de padding do RFC 8188.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      concat(plaintext, Uint8Array.of(2))
    )
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);

  return concat(salt, recordSize, Uint8Array.of(asPublicRaw.length), asPublicRaw, ciphertext);
}

// ---------------------------------------------------------------------------
// VAPID — prova para o push service de que o envio partiu deste servidor.
// ---------------------------------------------------------------------------
async function importVapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const publicRaw = b64urlToBytes(publicKey);
  if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY inválida: esperado ponto P-256 não comprimido (65 bytes).');
  }

  // A chave privada do `web-push generate-vapid-keys` é o escalar de 32 bytes
  // em base64url. A WebCrypto só importa EC como JWK, então montamos o JWK
  // juntando o escalar com as coordenadas da chave pública.
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64url(publicRaw.slice(1, 33)),
      y: bytesToB64url(publicRaw.slice(33, 65)),
      d: privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

export async function vapidHeader(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string
): Promise<string> {
  const key = await importVapidKey(publicKey, privateKey);

  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      })
    )
  );

  const signingInput = `${header}.${claims}`;
  // ECDSA na WebCrypto já sai como r||s cru, que é o formato do JWS.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput))
  );

  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${publicKey}`;
}

// ---------------------------------------------------------------------------
export type SendResult = {
  ok: boolean;
  status: number;
  /** true quando o navegador desinstalou/expirou a inscrição: apagar o token. */
  gone: boolean;
  error?: string;
};

/**
 * Envia uma notificação para UMA inscrição.
 *
 * Nunca lança: um aparelho com inscrição podre não pode derrubar o envio para
 * os outros. Quem chama decide o que fazer com `gone`.
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: unknown,
  options: { publicKey: string; privateKey: string; subject: string; ttlSeconds?: number }
): Promise<SendResult> {
  try {
    const body = await encryptPayload(subscription, utf8(JSON.stringify(payload)));
    const authorization = await vapidHeader(
      subscription.endpoint,
      options.publicKey,
      options.privateKey,
      options.subject
    );

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds ?? 86400),
        // Pedido de comida é sensível a tempo: não vale entregar depois.
        Urgency: 'high',
      },
      body,
    });

    // 404/410 = inscrição morta. 400/401/403 = nossa configuração está errada,
    // e aí apagar o token só esconderia o problema.
    const gone = response.status === 404 || response.status === 410;

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { ok: false, status: response.status, gone, error: detail.slice(0, 200) };
    }

    return { ok: true, status: response.status, gone: false };
  } catch (error) {
    return { ok: false, status: 0, gone: false, error: (error as Error).message };
  }
}
