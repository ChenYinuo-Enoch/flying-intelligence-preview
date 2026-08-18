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
    assert.match(workflow, /run-name:\s*Admin Publish.*inputs\.update_id/);
    assert.match(workflow, /update_id:/);
    assert.match(workflow, /staging_commit_sha:/);
    assert.match(workflow, /package_id.*INPUT_UPDATE_ID|INPUT_UPDATE_ID.*package_id/s);
    assert.match(workflow, /EXPECTED_STAGING_BRANCH:\s*admin-staging\/\$\{\{ inputs\.update_id \}\}/);
    assert.match(workflow, /git show "\$STAGING_COMMIT_SHA:\.admin-staging\/update\.json"/);
    assert.match(workflow, /rev-parse.*STAGING_BRANCH.*STAGING_COMMIT_SHA/s);
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
    assert.match(workflow, /run-name:\s*Admin Rollback/);
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
    assert.match(helper, /Publish-Admin-Update\.ps1/);
    assert.doesNotMatch(helper, /git\s+-C|worktree|cmd(?:\.exe)?\s+\/c|push[^\r\n]*(?:--force|force-with-lease)|upstream[^\r\n]*push/i);
});

test('root automation scripts are fixed to the Preview repository and expose no target override', function () {
    const publish = read('Publish-Admin-Update.ps1');
    const rollback = read('Rollback-Admin-Update.ps1');
    const common = read('tools/admin-github-common.ps1');
    assert.match(publish, /PackagePath/);
    assert.match(publish, /DryRun/);
    assert.match(rollback, /DryRun/);
    assert.match(common, /ChenYinuo-Enoch/);
    assert.match(common, /flying-intelligence-preview/);
    assert.match(common, /admin-staging\//);
    assert.match(common, /gh @nativeArguments 2>&1 \| ForEach-Object \{ Write-Host/);
    assert.match(common, /GITHUB_TOKEN_ENVIRONMENT_FORBIDDEN/);
    assert.match(common, /auth.*status.*--active.*--hostname.*github\.com/);
    assert.match(common, /api.*--hostname.*github\.com/);
    assert.match(common, /github\.com\/ChenYinuo-Enoch\/flying-intelligence-preview/);
    assert.match(common, /run.*view.*status,conclusion,url/);
    assert.match(common, /Assert-AdminCommitParent/);
    assert.match(publish, /watch\.Succeeded[\s\S]*COMMIT_SUCCESS_PAGES_PENDING/);
    assert.match(rollback, /watch\.Succeeded[\s\S]*COMMIT_SUCCESS_PAGES_PENDING/);
    assert.doesNotMatch(`${publish}\n${rollback}`, /\[(?:string|switch)\]\$(?:Owner|Repo|Branch)/i);
    assert.doesNotMatch(`${publish}\n${rollback}\n${common}`, /cmd(?:\.exe)?\s+\/c|gh\s+auth\s+token|--force|force-with-lease|push\s+upstream/i);
});
