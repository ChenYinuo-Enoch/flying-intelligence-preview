import { HttpError } from './http';
import { timingSafeEqual } from 'node:crypto';

const PUBLIC_ACCOUNT = 'flying-admin';

interface LoginInput {
  account: string;
  password: string;
}

interface FirebaseLoginResponse {
  localId: string;
  email: string;
  displayName: string;
  idToken: string;
  registered: boolean;
  refreshToken: string;
  expiresIn: string;
}

async function secureTextEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  return timingSafeEqual(Buffer.from(leftHash), Buffer.from(rightHash));
}

function isFirebaseLoginResponse(value: unknown): value is FirebaseLoginResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.localId === 'string' && typeof record.email === 'string' &&
    typeof record.idToken === 'string' && typeof record.refreshToken === 'string';
}

function authenticationError(): HttpError {
  return new HttpError(401, 'Unable to sign in with this account.');
}

export async function authenticateAdmin(input: LoginInput, env: Env, fetcher: typeof fetch = fetch): Promise<{ uid: string }> {
  if (!input || typeof input.account !== 'string' || typeof input.password !== 'string' ||
      input.account.trim() !== PUBLIC_ACCOUNT || !input.password || input.password.length > 4_096) {
    throw authenticationError();
  }
  if (!env.ADMIN_FIREBASE_EMAIL || !env.ADMIN_FIREBASE_UID || !env.FIREBASE_API_KEY) {
    throw new HttpError(503, 'Administrator service is not configured.');
  }

  let response: Response;
  try {
    response = await fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: env.ADMIN_FIREBASE_EMAIL,
          password: input.password,
          returnSecureToken: true
        })
      }
    );
  } catch {
    throw authenticationError();
  }

  if (!response.ok) throw authenticationError();
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw authenticationError();
  }
  if (!isFirebaseLoginResponse(result) || !await secureTextEqual(result.localId, env.ADMIN_FIREBASE_UID)) {
    throw authenticationError();
  }
  return { uid: result.localId };
}
