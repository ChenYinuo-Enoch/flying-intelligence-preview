import { authenticateAdmin } from './firebase';
import { GitHubClient } from './github';
import { corsHeaders, HttpError } from './http';
import { Publisher } from './publisher';
import { issueSession, verifySession, type SessionPayload } from './session';

const MAX_JSON_BYTES = 7_200_000;

interface PublisherLike {
  state(): Promise<unknown>;
  publish(input: never): Promise<unknown>;
  rollback(input: never): Promise<unknown>;
}

export interface RouteDependencies {
  authenticate(input: { account: string; password: string }, env: Env): Promise<{ uid: string }>;
  issueSession(secret: string, options?: { ttlSeconds?: number }): Promise<string>;
  verifySession(token: string, secret: string): Promise<SessionPayload | null>;
  createPublisher(env: Env): PublisherLike;
}

const defaultDependencies: RouteDependencies = {
  authenticate: authenticateAdmin,
  issueSession,
  verifySession,
  createPublisher(env) {
    return new Publisher(new GitHubClient(env.GITHUB_TOKEN));
  }
};

function responseHeaders(originHeaders: Headers | null): Headers {
  const headers = new Headers(originHeaders || undefined);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function jsonResponse(originHeaders: Headers | null, value: unknown, status = 200): Response {
  const headers = responseHeaders(originHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Invalid request body.');
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Invalid request fields.');
  }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new HttpError(413, 'Request body is too large.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new HttpError(413, 'Request body is too large.');
  }
  try {
    return objectValue(JSON.parse(text));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

function validateLogin(input: Record<string, unknown>) {
  exactKeys(input, ['account', 'password']);
  if (typeof input.account !== 'string' || typeof input.password !== 'string') {
    throw new HttpError(400, 'Invalid login request.');
  }
  return { account: input.account, password: input.password };
}

function validatePublish(input: Record<string, unknown>): never {
  if (input.kind === 'member-status') {
    exactKeys(input, ['baseCommitSha', 'kind', 'update']);
    exactKeys(objectValue(input.update), ['id', 'status', 'time']);
    return input as never;
  }
  if (input.kind === 'publication' || input.kind === 'member') {
    exactKeys(input, ['baseCommitSha', 'kind', 'draft', 'image']);
    exactKeys(objectValue(input.image), ['name', 'type', 'size', 'base64']);
    exactKeys(objectValue(input.draft), input.kind === 'publication'
      ? ['title', 'authors', 'date', 'venue', 'url', 'tags', 'coverPosition', 'mediaFitMode', 'video']
      : ['type', 'year', 'name', 'time', 'institution', 'research', 'email', 'profileUrl', 'scholarUrl']);
    return input as never;
  }
  throw new HttpError(400, 'Invalid publish operation.');
}

function validateRollback(input: Record<string, unknown>): never {
  exactKeys(input, ['baseCommitSha']);
  return input as never;
}

async function requireSession(request: Request, env: Env, dependencies: RouteDependencies): Promise<SessionPayload> {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) throw new HttpError(401, 'Administrator session is required.');
  const session = await dependencies.verifySession(match[1], env.SESSION_SECRET);
  if (!session) throw new HttpError(401, 'Administrator session has expired.');
  return session;
}

function isKnownPath(path: string): boolean {
  return ['/auth/login', '/auth/status', '/state', '/publish', '/rollback'].includes(path);
}

export async function handleRequest(
  request: Request,
  env: Env,
  dependencies: RouteDependencies = defaultDependencies
): Promise<Response> {
  const originHeaders = corsHeaders(request.headers.get('Origin'));
  if (!originHeaders) return jsonResponse(null, { error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(originHeaders) });

  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  try {
    if (path === '/auth/login' && request.method === 'POST') {
      const credentials = validateLogin(await jsonBody(request));
      await dependencies.authenticate(credentials, env);
      const token = await dependencies.issueSession(env.SESSION_SECRET, { ttlSeconds: 1_800 });
      return jsonResponse(originHeaders, { token, expiresIn: 1_800 });
    }

    if (path === '/auth/status' && request.method === 'GET') {
      const session = await requireSession(request, env, dependencies);
      return jsonResponse(originHeaders, { authenticated: true, expiresAt: session.exp });
    }

    if (path === '/state' && request.method === 'GET') {
      await requireSession(request, env, dependencies);
      return jsonResponse(originHeaders, await dependencies.createPublisher(env).state());
    }

    if (path === '/publish' && request.method === 'POST') {
      await requireSession(request, env, dependencies);
      return jsonResponse(originHeaders, await dependencies.createPublisher(env).publish(validatePublish(await jsonBody(request))));
    }

    if (path === '/rollback' && request.method === 'POST') {
      await requireSession(request, env, dependencies);
      return jsonResponse(originHeaders, await dependencies.createPublisher(env).rollback(validateRollback(await jsonBody(request))));
    }

    if (isKnownPath(path)) throw new HttpError(405, 'Method not allowed.');
    throw new HttpError(404, 'Not found.');
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(originHeaders, { error: error.message }, error.status);
    return jsonResponse(originHeaders, { error: 'Internal server error.' }, 500);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
} satisfies ExportedHandler<Env>;
