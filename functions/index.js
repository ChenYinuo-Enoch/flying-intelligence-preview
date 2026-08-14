'use strict';

const { randomBytes } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const content = require('./lib/content');

initializeApp();

const EXPECTED_REPOSITORY = 'ChenYinuo-Enoch/flying-intelligence.github.io';
const EXPECTED_PARENT = 'Flying-Intelligence/flying-intelligence.github.io';
const REGION = 'us-central1';
const githubToken = defineSecret('GITHUB_TOKEN');
const adminUids = defineString('ADMIN_UIDS');
const targetRepository = defineString('TARGET_REPOSITORY', { default: EXPECTED_REPOSITORY });
const targetBaseBranch = defineString('TARGET_BASE_BRANCH', { default: 'main' });

function configuredAdminUids() {
    return new Set(adminUids.value().split(/[\s,]+/).map(function (uid) { return uid.trim(); }).filter(Boolean));
}

function requireAdministrator(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Administrator authentication is required.');
    }
    const allowed = configuredAdminUids();
    if (!allowed.size || !allowed.has(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Administrator access is required.');
    }
    return request.auth.uid;
}

function configuredTarget() {
    const repository = targetRepository.value().trim();
    const baseBranch = targetBaseBranch.value().trim();
    if (repository !== EXPECTED_REPOSITORY) {
        throw new Error('The configured target repository is not the approved fork.');
    }
    if (!baseBranch || baseBranch.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(baseBranch) ||
        baseBranch.includes('..') || baseBranch.includes('@{') || /^\//.test(baseBranch) || /[/.]$/.test(baseBranch)) {
        throw new Error('The configured target base branch is invalid.');
    }
    return { repository: repository, baseBranch: baseBranch };
}

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

async function apiRequest(token, path, options) {
    const request = options || {};
    const response = await fetch(`https://api.github.com${path}`, {
        method: request.method || 'GET',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(request.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: request.body ? JSON.stringify(request.body) : undefined
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
        try { payload = JSON.parse(responseText); }
        catch (error) { payload = null; }
    }
    if (!response.ok) {
        const failure = new Error(`Repository service request failed with status ${response.status}.`);
        failure.status = response.status;
        throw failure;
    }
    return payload;
}

async function readTextFile(token, repository, path, revision) {
    const payload = await apiRequest(token, `/repos/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(revision)}`);
    if (!payload || payload.type !== 'file' || typeof payload.content !== 'string' || payload.encoding !== 'base64') {
        throw new Error(`Required content file is unavailable: ${path}`);
    }
    return Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

function branchName(kind) {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `content/${kind}-${timestamp}-${randomBytes(3).toString('hex')}`;
}

async function loadLatestSnapshot(token, repository, baseBranch) {
    const repositoryInfo = await apiRequest(token, `/repos/${repository}`);
    const expectedRepository = repositoryInfo && repositoryInfo.full_name === EXPECTED_REPOSITORY;
    const expectedParent = repositoryInfo && repositoryInfo.fork === true && repositoryInfo.parent &&
        repositoryInfo.parent.full_name === EXPECTED_PARENT;
    const canWrite = repositoryInfo && repositoryInfo.permissions && repositoryInfo.permissions.push === true;
    if (!expectedRepository || !expectedParent || !canWrite) {
        throw new Error('The protected repository configuration is invalid.');
    }

    const branch = await apiRequest(token, `/repos/${repository}/branches/${encodeURIComponent(baseBranch)}`);
    if (!branch || !branch.commit || !branch.commit.sha) throw new Error('The target base branch is unavailable.');
    const baseSha = branch.commit.sha;
    const baseCommit = await apiRequest(token, `/repos/${repository}/git/commits/${baseSha}`);
    if (!baseCommit || !baseCommit.tree || !baseCommit.tree.sha) throw new Error('The target base commit is unavailable.');

    const snapshot = await Promise.all([
        readTextFile(token, repository, 'papers-data.js', baseSha),
        readTextFile(token, repository, 'data/members.js', baseSha),
        apiRequest(token, `/repos/${repository}/git/trees/${baseCommit.tree.sha}?recursive=1`)
    ]);
    return {
        baseSha: baseSha,
        baseTreeSha: baseCommit.tree.sha,
        papersSource: snapshot[0],
        membersSource: snapshot[1],
        paths: new Set((snapshot[2].tree || []).map(function (entry) { return entry.path; }))
    };
}

async function createReviewUpdate(token, target, input) {
    const kind = input && input.kind;
    if (!['publication', 'member'].includes(kind)) {
        throw new HttpsError('invalid-argument', 'Update type is invalid.');
    }
    const image = content.validateImage(input.image);
    const draft = kind === 'publication'
        ? content.validatePublicationDraft(input.draft)
        : content.validateMemberDraft(input.draft);
    const snapshot = await loadLatestSnapshot(token, target.repository, target.baseBranch);

    const stem = content.slugify(kind === 'publication' ? draft.title : draft.name, kind);
    const imagePath = content.uniquePath(
        snapshot.paths,
        kind === 'publication' ? 'files/images' : 'groups',
        stem,
        image.extension
    );
    let dataPath;
    let updatedSource;
    let recordName;
    if (kind === 'publication') {
        if (content.checkPublicationDuplicate(content.parsePublicationRecords(snapshot.papersSource), draft)) {
            throw new HttpsError('already-exists', 'This publication already exists.');
        }
        draft.img = imagePath;
        dataPath = 'papers-data.js';
        recordName = draft.title;
        updatedSource = content.appendArrayEntry(snapshot.papersSource, content.publicationEntry(draft), 'papers');
    } else {
        if (content.checkMemberDuplicate(content.parseMemberRecords(snapshot.membersSource), draft)) {
            throw new HttpsError('already-exists', 'This member already exists.');
        }
        draft.image = `../${imagePath}`;
        dataPath = 'data/members.js';
        recordName = draft.name;
        updatedSource = content.appendArrayEntry(snapshot.membersSource, content.memberEntry(draft), 'members');
    }

    const blobs = await Promise.all([
        apiRequest(token, `/repos/${target.repository}/git/blobs`, {
            method: 'POST',
            body: { content: updatedSource, encoding: 'utf-8' }
        }),
        apiRequest(token, `/repos/${target.repository}/git/blobs`, {
            method: 'POST',
            body: { content: image.buffer.toString('base64'), encoding: 'base64' }
        })
    ]);
    const tree = await apiRequest(token, `/repos/${target.repository}/git/trees`, {
        method: 'POST',
        body: {
            base_tree: snapshot.baseTreeSha,
            tree: [
                { path: dataPath, mode: '100644', type: 'blob', sha: blobs[0].sha },
                { path: imagePath, mode: '100644', type: 'blob', sha: blobs[1].sha }
            ]
        }
    });
    const branch = branchName(kind);
    const subject = content.shortSubject(recordName);
    const commitMessage = kind === 'publication'
        ? `content: add publication "${subject}"`
        : `content: add member "${subject}"`;
    const commit = await apiRequest(token, `/repos/${target.repository}/git/commits`, {
        method: 'POST',
        body: { message: commitMessage, tree: tree.sha, parents: [snapshot.baseSha] }
    });
    await apiRequest(token, `/repos/${target.repository}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${branch}`, sha: commit.sha }
    });
    const pullRequest = await apiRequest(token, `/repos/${target.repository}/pulls`, {
        method: 'POST',
        body: {
            title: kind === 'publication' ? `content: add publication ${recordName}` : `content: add member ${recordName}`,
            head: branch,
            base: target.baseBranch,
            body: [
                `Type: ${kind === 'publication' ? 'Publication' : 'Member'}`,
                `Record: ${recordName}`,
                '',
                'This update was submitted through the authenticated Flying Intelligence content manager.',
                'Review is required; no automatic merge is performed.'
            ].join('\n')
        }
    });
    if (!pullRequest || !pullRequest.number) throw new Error('Review request creation failed.');
}

exports.getAdminStatus = onCall({ region: REGION, timeoutSeconds: 15, memory: '256MiB' }, async function (request) {
    requireAdministrator(request);
    return { authorized: true };
});

exports.submitUpdate = onCall({
    region: REGION,
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 5,
    secrets: [githubToken]
}, async function (request) {
    requireAdministrator(request);
    try {
        const target = configuredTarget();
        const token = githubToken.value();
        if (!token) throw new Error('The repository credential is unavailable.');
        await createReviewUpdate(token, target, request.data || {});
        logger.info('Administrator content update submitted for review.', { kind: request.data && request.data.kind });
        return {
            success: true,
            message: 'Update submitted successfully. Your update has been submitted for review.'
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error && error.code === 'invalid-argument') {
            throw new HttpsError('invalid-argument', 'The submitted update is invalid.');
        }
        logger.error('Administrator content update failed.', {
            kind: request.data && request.data.kind,
            error: error && error.message ? error.message : 'unknown'
        });
        throw new HttpsError('internal', 'Unable to submit this update.');
    }
});
