import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type RouteDependencies } from '../src/index';

const origin = 'https://chenyinuo-enoch.github.io';
const env = {
  FIREBASE_API_KEY: 'AIzaSyB0amcp4dagkWgPC8nvWad9B13hxR4Yrvo',
  FIREBASE_PROJECT_ID: 'flying-intelligence-admin',
  ADMIN_FIREBASE_EMAIL: 'admin@example.test',
  ADMIN_FIREBASE_UID: 'allowed-uid',
  SESSION_SECRET: 'test-session-secret-that-is-longer-than-thirty-two-bytes',
  GITHUB_TOKEN: 'test-github-token'
} satisfies Env;

function dependencies() {
  const publish = vi.fn(async () => ({ commitSha: 'a'.repeat(40) }));
  const rollback = vi.fn(async () => ({ commitSha: 'b'.repeat(40) }));
  const state = vi.fn(async () => ({ mainSha: 'c'.repeat(40), members: [], rollback: { available: false, commitSha: null } }));
  const deps: RouteDependencies = {
    authenticate: vi.fn(async () => ({ uid: 'allowed-uid' })),
    issueSession: vi.fn(async () => 'signed-session-token'),
    verifySession: vi.fn(async (token) => token === 'signed-session-token' ? { sub: 'admin' as const, iat: 1, exp: 2 } : null),
    createPublisher: vi.fn(() => ({ publish, rollback, state }))
  };
  return { deps, publish, rollback, state };
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Origin', origin);
  return new Request(`https://worker.example${path}`, { ...init, headers });
}

describe('Worker routes', () => {
  it('allows CORS only for the exact configured origins', async () => {
    const { deps } = dependencies();
    const denied = await handleRequest(new Request('https://worker.example/auth/status', {
      headers: { Origin: 'https://example.org' }
    }), env, deps);
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const preflight = await handleRequest(request('/publish', { method: 'OPTIONS' }), env, deps);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('false');
  });

  it('maps login to a short-lived opaque Worker session without returning Firebase data', async () => {
    const { deps } = dependencies();
    const response = await handleRequest(request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'flying-admin', password: 'not-a-real-password' })
    }), env, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'signed-session-token', expiresIn: 1800 });
    expect(deps.authenticate).toHaveBeenCalledWith({ account: 'flying-admin', password: 'not-a-real-password' }, env);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('requires a valid Bearer session for protected state and write routes', async () => {
    const { deps, state } = dependencies();
    const missing = await handleRequest(request('/state'), env, deps);
    expect(missing.status).toBe(401);
    const valid = await handleRequest(request('/state', {
      headers: { Authorization: 'Bearer signed-session-token' }
    }), env, deps);
    expect(valid.status).toBe(200);
    expect(state).toHaveBeenCalledOnce();
  });

  it('rejects client-supplied repository targets and unknown fields before publishing', async () => {
    const { deps, publish } = dependencies();
    const response = await handleRequest(request('/publish', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer signed-session-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        baseCommitSha: '1'.repeat(40),
        kind: 'member-status',
        update: { id: 'member', status: 'current', time: '' },
        repository: 'another-repository'
      })
    }), env, deps);
    expect(response.status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
  });

  it('passes one exact validated operation to publish and rollback', async () => {
    const { deps, publish, rollback } = dependencies();
    const operation = {
      baseCommitSha: '1'.repeat(40),
      kind: 'member-status',
      update: { id: 'member', status: 'current', time: '' }
    };
    const publishResponse = await handleRequest(request('/publish', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer signed-session-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(operation)
    }), env, deps);
    expect(publishResponse.status).toBe(200);
    expect(publish).toHaveBeenCalledWith(operation);

    const rollbackOperation = { baseCommitSha: '2'.repeat(40) };
    const rollbackResponse = await handleRequest(request('/rollback', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer signed-session-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rollbackOperation)
    }), env, deps);
    expect(rollbackResponse.status).toBe(200);
    expect(rollback).toHaveBeenCalledWith(rollbackOperation);
  });

  it('rejects wrong methods and oversized JSON bodies', async () => {
    const { deps } = dependencies();
    const wrongMethod = await handleRequest(request('/publish', { method: 'GET' }), env, deps);
    expect(wrongMethod.status).toBe(405);
    const oversized = await handleRequest(request('/publish', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer signed-session-token',
        'Content-Type': 'application/json',
        'Content-Length': '8000000'
      },
      body: '{}'
    }), env, deps);
    expect(oversized.status).toBe(413);
  });
});
