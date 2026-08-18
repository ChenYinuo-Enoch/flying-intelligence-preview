'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('publish workflow is manually triggered, repository locked, staging-only, non-force, and deploys directly', function () {
    const workflow = read('.github/workflows/admin-publish.yml');
    assert.match(workflow, /name:\s*Admin Publish Preview Update/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /contents:\s*write/);
    assert.match(workflow, /pages:\s*write/);
    assert.match(workflow, /id-token:\s*write/);
    assert.match(workflow, /ChenYinuo-Enoch\/flying-intelligence-preview/);
    assert.match(workflow, /\^admin-staging\/\[A-Za-z0-9\._-\]\+\$/);
    assert.match(workflow, /\.admin-staging\/update\.json/);
    assert.match(workflow, /ref:\s*main/);
    assert.match(workflow, /actions\/deploy-pages@v4/);
    assert.doesNotMatch(workflow, /checkout[^\n]*staging|--force|force-with-lease|pull_request|secrets\.[A-Za-z_]+/i);
});

test('rollback workflow requires exact head and uses revert without force', function () {
    const workflow = read('.github/workflows/admin-rollback.yml');
    assert.match(workflow, /name:\s*Admin Rollback Last Update/);
    assert.match(workflow, /expected_head_sha/);
    assert.match(workflow, /git revert/);
    assert.match(workflow, /admin: rollback/);
    assert.match(workflow, /actions\/deploy-pages@v4/);
    assert.doesNotMatch(workflow, /reset\s+--hard|--force|force-with-lease/i);
});

test('ordinary Pages workflow deploys main and emits deployed build metadata', function () {
    const workflow = read('.github/workflows/pages.yml');
    assert.match(workflow, /branches:\s*\[main\]/);
    assert.match(workflow, /actions\/upload-pages-artifact@v3/);
    assert.match(workflow, /actions\/deploy-pages@v4/);
    assert.match(workflow, /_preview-build\.json/);
});

test('staging helper fixes identity, origin and staging prefix without PR or force', function () {
    const helper = read('tools/stage-admin-update.ps1');
    assert.match(helper, /ChenYinuo-Enoch/);
    assert.match(helper, /flying-intelligence-preview/);
    assert.match(helper, /admin-staging\//);
    assert.match(helper, /\.admin-staging[\\/]update\.json/);
    assert.match(helper, /Do NOT create a Pull Request\./);
    assert.doesNotMatch(helper, /push[^\r\n]*(?:--force|force-with-lease)|upstream[^\r\n]*push/i);
});
