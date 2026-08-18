'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin', 'admin.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'admin', 'admin-api-config.js'), 'utf8');

test('Admin loads the Worker API runtime and not the client-side simple gate', function () {
    assert.match(html, /admin-api-config\.js/);
    assert.match(html, /admin-api\.js/);
    assert.doesNotMatch(html, /simple-auth(?:-config)?\.js/);
    assert.doesNotMatch(script, /adminUnlocked/);
    assert.match(script, /adminApi\.login/);
    assert.match(script, /adminApi\.publish/);
    assert.match(script, /adminApi\.rollback/);
});

test('Admin exposes accessible Manage Members status controls and publish confirmations', function () {
    assert.match(html, /id="manage-members-tab"/);
    assert.match(html, /name="managed-member-status" value="current"/);
    assert.match(html, /name="managed-member-status" value="former"/);
    assert.match(html, /id="publish-update-button"/);
    assert.match(html, /id="rollback-update-button"/);
    assert.match(script, /Publish this update\?/);
    assert.match(script, /Roll back this update\?/);
});

test('local verification cannot perform remote writes', function () {
    assert.match(config, /allowWrites:\s*!local/);
    assert.match(script, /Remote writes are disabled during local verification/);
});
