export const ALLOWED_ORIGINS = Object.freeze([
  'https://chenyinuo-enoch.github.io',
  'http://127.0.0.1:8127',
  'http://localhost:8127'
]);

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function corsHeaders(origin: string | null): Headers | null {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  });
}

