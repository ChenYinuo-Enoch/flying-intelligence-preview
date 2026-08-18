'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const SHA = '3'.repeat(40);

test('trusted CLI applies only the expected status data file in a clean Git worktree', function () {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'flying-admin-cli-'));
    fs.mkdirSync(path.join(repository, 'data'), { recursive: true });
    fs.writeFileSync(path.join(repository, 'data', 'members.js'), 'const members = [\n    {\n        id: "member-one",\n        type: "member",\n        status: "current",\n        year: 2025,\n        name: "Member One",\n        image: "../groups/one.png",\n        alt: "Member One",\n        profileUrl: "",\n        time: "(2025 - Present)",\n        institution: "Institute",\n        research: "Research",\n        email: "one@example.com",\n        links: []\n    },\n];\n');
    fs.writeFileSync(path.join(repository, 'papers-data.js'), 'const papers = [\n];\n');
    spawnSync('git', ['init'], { cwd: repository, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repository });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repository });
    spawnSync('git', ['add', '-A'], { cwd: repository });
    spawnSync('git', ['commit', '-m', 'baseline'], { cwd: repository, encoding: 'utf8' });

    const packagePath = path.join(repository, 'update.json');
    const resultPath = path.join(repository, 'result.json');
    fs.writeFileSync(packagePath, JSON.stringify({
        schemaVersion: 1,
        updateId: '20260818-102030-abc12345',
        updateType: 'member_status',
        createdAt: '2026-08-18T10:20:30.000Z',
        baseCommitSha: SHA,
        previewSite: 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/',
        targetEnvironment: 'preview',
        content: { id: 'member-one', status: 'former', time: '(2025 - 2026)' }
    }));
    spawnSync('git', ['add', 'update.json'], { cwd: repository });
    spawnSync('git', ['commit', '-m', 'package fixture'], { cwd: repository });

    const run = spawnSync(process.execPath, [
        path.join(root, 'scripts', 'apply-admin-update.mjs'),
        '--package', packagePath,
        '--repository', repository,
        '--expected-base', SHA,
        '--result', resultPath
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.deepEqual(result.changedPaths, ['data/members.js']);
    assert.match(run.stdout, /ADMIN_UPDATE_APPLIED=/);
    const changed = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repository, encoding: 'utf8' }).stdout;
    assert.match(changed, /data\/members\.js/);
    assert.match(changed, /result\.json/);
});
