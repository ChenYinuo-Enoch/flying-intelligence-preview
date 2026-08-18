'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('../admin/publish-package.js');

test('creates a target-free versioned publish package and deterministic filename', function () {
    const payload = packageApi.createPublishPackage({
        updateType: 'member_status',
        baseCommitSha: 'a'.repeat(40),
        content: { id: 'member-one', status: 'former', time: '(2025 - 2026)' },
        now: new Date('2026-08-18T10:20:30.000Z'),
        randomId: 'abc12345'
    });

    assert.deepEqual(payload, {
        schemaVersion: 1,
        updateId: '20260818-102030-abc12345',
        updateType: 'member_status',
        createdAt: '2026-08-18T10:20:30.000Z',
        baseCommitSha: 'a'.repeat(40),
        previewSite: 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/',
        targetEnvironment: 'preview',
        content: { id: 'member-one', status: 'former', time: '(2025 - 2026)' }
    });
    assert.equal(packageApi.packageFileName(payload), 'flying-admin-update-20260818-102030-abc12345.json');
    assert.equal(Object.hasOwn(payload, 'targetOwner'), false);
    assert.equal(Object.hasOwn(payload, 'targetRepo'), false);
    assert.equal(Object.hasOwn(payload, 'targetBranch'), false);
});

test('accepts an unbound local base and rejects unsupported update types or malformed SHA values', function () {
    const common = {
        content: {},
        now: new Date('2026-08-18T10:20:30.000Z'),
        randomId: 'abc12345'
    };
    assert.equal(packageApi.createPublishPackage(Object.assign({ updateType: 'add_member', baseCommitSha: '' }, common)).baseCommitSha, '');
    assert.throws(function () {
        packageApi.createPublishPackage(Object.assign({ updateType: 'raw_patch', baseCommitSha: '' }, common));
    }, /update type/i);
    assert.throws(function () {
        packageApi.createPublishPackage(Object.assign({ updateType: 'add_member', baseCommitSha: 'latest' }, common));
    }, /base commit/i);
});

test('builds a quoted staging command without embedding credentials', function () {
    const command = packageApi.stagingCommand('C:\\Users\\Example User\\Downloads\\flying-admin-update-1.json');
    assert.match(command, /^\.\\tools\\stage-admin-update\.ps1/);
    assert.match(command, /-PackagePath "C:\\Users\\Example User\\Downloads\\flying-admin-update-1\.json"/);
    assert.doesNotMatch(command, /token|password|secret|github_pat_|ghp_/i);
});
