import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS, corsHeaders } from '../src/http';
import { authenticateAdmin } from '../src/firebase';
import { issueSession, verifySession } from '../src/session';

const sessionSecret = 'test-session-secret-that-is-longer-than-thirty-two-bytes';

describe('signed administrator sessions', () => {
  it('issues a short-lived token that verifies to the administrator subject', async () => {
    const token = await issueSession(sessionSecret, { nowSeconds: 1_000, ttlSeconds: 1_800 });
    const payload = await verifySession(token, sessionSecret, 1_001);
    expect(payload).toEqual({ sub: 'admin', iat: 1_000, exp: 2_800 });
    expect(token).not.toContain(sessionSecret);
  });

  it('rejects tampered and expired tokens', async () => {
    const token = await issueSession(sessionSecret, { nowSeconds: 1_000, ttlSeconds: 1_800 });
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(await verifySession(tampered, sessionSecret, 1_001)).toBeNull();
    expect(await verifySession(token, sessionSecret, 2_801)).toBeNull();
  });
});

describe('origin boundary', () => {
  it('returns credential-safe CORS headers only for the three approved origins', () => {
    expect(ALLOWED_ORIGINS).toEqual([
      'https://chenyinuo-enoch.github.io',
      'http://127.0.0.1:8127',
      'http://localhost:8127'
    ]);
    for (const origin of ALLOWED_ORIGINS) {
      expect(corsHeaders(origin)?.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(corsHeaders(origin)?.get('Access-Control-Allow-Credentials')).toBe('false');
    }
    expect(corsHeaders('https://example.org')).toBeNull();
    expect(corsHeaders('*')).toBeNull();
  });
});

describe('Firebase administrator mapping', () => {
  const env = {
    FIREBASE_API_KEY: 'AIzaSyB0amcp4dagkWgPC8nvWad9B13hxR4Yrvo',
    FIREBASE_PROJECT_ID: 'flying-intelligence-admin',
    ADMIN_FIREBASE_EMAIL: 'admin@example.test',
    ADMIN_FIREBASE_UID: 'allowed-uid',
    SESSION_SECRET: sessionSecret,
    GITHUB_TOKEN: 'test-github-token'
  } satisfies Env;

  it('maps the public account label to the secret email and accepts only the configured UID', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        localId: 'allowed-uid',
        email: 'admin@example.test',
        displayName: '',
        idToken: 'firebase-id-token',
        registered: true,
        refreshToken: 'firebase-refresh-token',
        expiresIn: '3600'
      });
    };

    await expect(authenticateAdmin({ account: 'flying-admin', password: 'test-password' }, env, fetcher))
      .resolves.toEqual({ uid: 'allowed-uid' });
    expect(requestUrl).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyB0amcp4dagkWgPC8nvWad9B13hxR4Yrvo');
    expect(requestBody).toEqual({
      email: 'admin@example.test',
      password: 'test-password',
      returnSecureToken: true
    });
  });

  it('returns one generic error for a wrong account or a different Firebase UID', async () => {
    const wrongUidFetcher: typeof fetch = async () => Response.json({
      localId: 'different-uid',
      email: 'admin@example.test',
      displayName: '',
      idToken: 'firebase-id-token',
      registered: true,
      refreshToken: 'firebase-refresh-token',
      expiresIn: '3600'
    });
    await expect(authenticateAdmin({ account: 'flying-admin', password: 'wrong' }, env, wrongUidFetcher))
      .rejects.toMatchObject({ status: 401, message: 'Unable to sign in with this account.' });
    await expect(authenticateAdmin({ account: 'another-account', password: 'wrong' }, env, wrongUidFetcher))
      .rejects.toMatchObject({ status: 401, message: 'Unable to sign in with this account.' });
  });
});
