'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin', 'admin.js'), 'utf8');

test('Admin uses the simple convenience gate and no external backend runtime', function () {
    assert.match(html, /simple-auth-config\.js/);
    assert.match(html, /simple-auth\.js/);
    assert.match(html, /publish-package\.js/);
    assert.doesNotMatch(html, /admin-api(?:-config)?\.js|firebase-config\.js|cloudflare|worker/i);
    assert.doesNotMatch(script, /GITHUB_TOKEN|github_pat_|ghp_|Firebase|Cloudflare|adminApi\.|\/publish|\/rollback/i);
    assert.match(script, /CONVENIENCE_UI_GATE|Publishing requires GitHub repository access/);
});

test('Admin presents package preparation without claiming publication', function () {
    assert.match(html, />Prepare GitHub Publish</);
    assert.match(html, /PUBLISH PACKAGE READY/);
    assert.match(html, /This update has not been published yet\./);
    assert.match(html, />Download Publish Package</);
    assert.match(html, />Copy Staging Command</);
    assert.match(html, /Do not include private or sensitive information\./);
    assert.match(html, /Do NOT create a Pull Request\./);
    assert.doesNotMatch(html, />Publish Update</);
});

test('Manage Members and preview controls remain available', function () {
    assert.match(html, />Manage Members</);
    assert.match(html, /value="current"/);
    assert.match(html, /value="former"/);
    assert.match(html, />Preview Update</);
    assert.match(script, /member-status/);
});
