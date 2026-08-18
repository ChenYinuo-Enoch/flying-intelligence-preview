export interface SessionPayload {
  sub: 'admin';
  iat: number;
  exp: number;
}

interface SessionOptions {
  nowSeconds?: number;
  ttlSeconds?: number;
}

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  if (encoder.encode(secret).byteLength < 32) throw new Error('session-secret-too-short');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function timingSafeEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  const leftCopy = Uint8Array.from(left);
  const rightCopy = Uint8Array.from(right);
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', leftCopy.buffer),
    crypto.subtle.digest('SHA-256', rightCopy.buffer)
  ]);
  return nodeTimingSafeEqual(Buffer.from(leftHash), Buffer.from(rightHash));
}

export async function issueSession(secret: string, options: SessionOptions = {}): Promise<string> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? 1_800;
  if (!Number.isInteger(now) || !Number.isInteger(ttl) || ttl < 60 || ttl > 3_600) {
    throw new Error('invalid-session-time');
  }
  const payload: SessionPayload = { sub: 'admin', iat: now, exp: now + ttl };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmac(secret, `v1.${encodedPayload}`));
  return `v1.${encodedPayload}.${signature}`;
}

export async function verifySession(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SessionPayload | null> {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const suppliedSignature = base64UrlDecode(parts[2]);
  if (!suppliedSignature) return null;
  let expectedSignature: Uint8Array;
  try {
    expectedSignature = await hmac(secret, `${parts[0]}.${parts[1]}`);
  } catch {
    return null;
  }
  if (!await timingSafeEqual(suppliedSignature, expectedSignature)) return null;
  const payloadBytes = base64UrlDecode(parts[1]);
  if (!payloadBytes) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    if (payload.sub !== 'admin' || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if ((payload.iat as number) > nowSeconds + 30 || (payload.exp as number) <= nowSeconds) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
