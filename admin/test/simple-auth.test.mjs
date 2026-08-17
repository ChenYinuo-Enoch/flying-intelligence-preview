import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { hashPassword } from '../../tools/generate-admin-password-hash.mjs';

const require = createRequire(import.meta.url);
const auth = require('../simple-auth.js');

test('placeholder configuration stays locked', function () {
    assert.equal(auth.isConfigured({ account: 'CHANGE_ME', passwordHash: 'CHANGE_ME' }), false);
});

test('dynamically generated credentials accept only the exact account and password', async function () {
    const password = `test-${Date.now()}-${Math.random()}`;
    const config = { account: 'temporary-admin', passwordHash: hashPassword(password) };
    assert.equal(auth.isConfigured(config), true);
    assert.equal(await auth.verifyCredentials(config, ' temporary-admin ', password), true);
    assert.equal(await auth.verifyCredentials(config, 'different-admin', password), false);
    assert.equal(await auth.verifyCredentials(config, 'temporary-admin', `${password}-wrong`), false);
});

test('hash helper and browser-compatible Web Crypto path agree', async function () {
    const password = `hash-${Date.now()}-${Math.random()}`;
    assert.equal(await auth.sha256Hex(password), hashPassword(password));
});
