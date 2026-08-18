'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../admin/admin-api.js');

function storage() {
    const values = new Map();
    return {
        getItem: function (key) { return values.has(key) ? values.get(key) : null; },
        setItem: function (key, value) { values.set(key, String(value)); },
        removeItem: function (key) { values.delete(key); }
    };
}

test('login stores only the Worker session token in session storage', async function () {
    const session = storage();
    const requests = [];
    const api = createAdminApi({
        baseUrl: 'https://worker.example',
        storage: session,
        fetch: async function (url, init) {
            requests.push({ url: url, init: init });
            return Response.json({ token: 'opaque-worker-session', expiresIn: 1800 });
        }
    });
    await api.login('flying-admin', 'private-password');
    assert.equal(session.getItem('flyingAdminSession'), 'opaque-worker-session');
    assert.equal(session.getItem('password'), null);
    assert.deepEqual(JSON.parse(requests[0].init.body), { account: 'flying-admin', password: 'private-password' });
});

test('protected calls use Bearer authentication and clear an expired session', async function () {
    const session = storage();
    session.setItem('flyingAdminSession', 'opaque-worker-session');
    let authorization = '';
    const api = createAdminApi({
        baseUrl: 'https://worker.example/',
        storage: session,
        fetch: async function (url, init) {
            authorization = init.headers.Authorization;
            return Response.json({ error: 'Administrator session has expired.' }, { status: 401 });
        }
    });
    await assert.rejects(api.getState(), /Administrator session has expired/);
    assert.equal(authorization, 'Bearer opaque-worker-session');
    assert.equal(session.getItem('flyingAdminSession'), null);
});

test('publish sends only the supplied operation to the fixed Worker URL', async function () {
    const session = storage();
    session.setItem('flyingAdminSession', 'opaque-worker-session');
    let request;
    const api = createAdminApi({
        baseUrl: 'https://worker.example',
        storage: session,
        fetch: async function (url, init) {
            request = { url: url, init: init };
            return Response.json({ commitSha: 'a'.repeat(40) });
        }
    });
    const operation = { baseCommitSha: 'b'.repeat(40), kind: 'member-status', update: { id: 'member', status: 'current', time: '' } };
    assert.deepEqual(await api.publish(operation), { commitSha: 'a'.repeat(40) });
    assert.equal(request.url, 'https://worker.example/publish');
    assert.deepEqual(JSON.parse(request.init.body), operation);
});
