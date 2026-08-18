import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

Object.assign(process.env, {
  ADMIN_FIREBASE_EMAIL: 'admin@example.test',
  ADMIN_FIREBASE_UID: 'test-admin-uid',
  SESSION_SECRET: 'test-session-secret-that-is-longer-than-thirty-two-bytes',
  GITHUB_TOKEN: 'test-github-token'
});

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ADMIN_FIREBASE_EMAIL: 'admin@example.test',
          ADMIN_FIREBASE_UID: 'test-admin-uid',
          SESSION_SECRET: 'test-session-secret-that-is-longer-than-thirty-two-bytes',
          GITHUB_TOKEN: 'test-github-token'
        }
      }
    })
  ]
});
