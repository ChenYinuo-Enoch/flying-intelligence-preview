'use strict';

const fs = require('node:fs');
const path = require('node:path');
const content = require('../../functions/lib/content.js');

const PREVIEW_SITE = 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/';
const UPDATE_TYPES = new Set(['add_member', 'add_publication', 'member_status']);
const PACKAGE_KEYS = new Set(['schemaVersion', 'updateId', 'updateType', 'createdAt', 'baseCommitSha', 'previewSite', 'targetEnvironment', 'content']);
const IMAGE_KEYS = new Set(['originalFilename', 'mimeType', 'byteLength', 'base64']);
const MEMBER_DRAFT_KEYS = new Set(['type', 'year', 'name', 'time', 'institution', 'research', 'email', 'profileUrl', 'scholarUrl']);
const PUBLICATION_DRAFT_KEYS = new Set(['title', 'authors', 'date', 'venue', 'url', 'tags', 'coverPosition', 'mediaFitMode', 'video']);

function invalid(message) {
    const error = new Error(message);
    error.code = 'invalid-admin-update';
    return error;
}

function plainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${label} must be an object.`);
    return value;
}

function assertOnlyKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter(function (key) { return !allowed.has(key); });
    if (unknown.length) throw invalid(`${label} contains unsupported field: ${unknown[0]}.`);
}

function validatePackageImage(value) {
    const image = plainObject(value, 'Image');
    assertOnlyKeys(image, IMAGE_KEYS, 'Image');
    const originalFilename = String(image.originalFilename || '');
    if (!originalFilename || originalFilename !== path.basename(originalFilename) || /[\\/\0]/.test(originalFilename)) {
        throw invalid('Image filename is invalid.');
    }
    const byteLength = Number(image.byteLength);
    if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > content.MAX_IMAGE_BYTES) {
        throw invalid('Image size is invalid.');
    }
    const validated = content.validateImage({
        name: originalFilename,
        type: image.mimeType,
        size: byteLength,
        base64: image.base64
    });
    return {
        originalFilename: validated.name,
        mimeType: validated.type,
        byteLength: validated.buffer.length,
        base64: image.base64,
        extension: validated.extension,
        buffer: validated.buffer
    };
}

function validatePublishPackage(value) {
    const payload = plainObject(value, 'Publish package');
    assertOnlyKeys(payload, PACKAGE_KEYS, 'Publish package');
    if (payload.schemaVersion !== 1) throw invalid('Publish package schema is unsupported.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$/.test(String(payload.updateId || ''))) {
        throw invalid('Update ID is invalid.');
    }
    if (!UPDATE_TYPES.has(payload.updateType)) throw invalid('Update type is unsupported.');
    if (typeof payload.createdAt !== 'string' || Number.isNaN(Date.parse(payload.createdAt))) {
        throw invalid('Package creation time is invalid.');
    }
    if (!/^[a-f0-9]{40}$/.test(String(payload.baseCommitSha || ''))) throw invalid('Base commit SHA is invalid.');
    if (payload.previewSite !== PREVIEW_SITE || payload.targetEnvironment !== 'preview') {
        throw invalid('Publish package target is invalid.');
    }

    const packageContent = plainObject(payload.content, 'Package content');
    let validatedContent;
    if (payload.updateType === 'member_status') {
        assertOnlyKeys(packageContent, new Set(['id', 'status', 'time']), 'Member status content');
        validatedContent = content.validateMemberStatusUpdate(packageContent);
    } else {
        assertOnlyKeys(packageContent, new Set(['draft', 'image']), 'Content update');
        const rawDraft = plainObject(packageContent.draft, 'Content draft');
        assertOnlyKeys(rawDraft, payload.updateType === 'add_member' ? MEMBER_DRAFT_KEYS : PUBLICATION_DRAFT_KEYS, 'Content draft');
        const draft = payload.updateType === 'add_member'
            ? content.validateMemberDraft(rawDraft)
            : content.validatePublicationDraft(rawDraft);
        validatedContent = { draft: draft, image: validatePackageImage(packageContent.image) };
    }

    return {
        schemaVersion: 1,
        updateId: payload.updateId,
        updateType: payload.updateType,
        createdAt: payload.createdAt,
        baseCommitSha: payload.baseCommitSha,
        previewSite: PREVIEW_SITE,
        targetEnvironment: 'preview',
        content: validatedContent
    };
}

function normalizedRepositoryPath(value) {
    return String(value).replace(/\\/g, '/').replace(/^\.\//, '');
}

function safeFilePath(repositoryRoot, relativePath) {
    const root = path.resolve(repositoryRoot);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw invalid('Generated path escapes the repository.');
    return target;
}

function assetPaths(repositoryRoot, directory) {
    const folder = safeFilePath(repositoryRoot, directory);
    if (!fs.existsSync(folder)) return new Set();
    return new Set(fs.readdirSync(folder, { withFileTypes: true })
        .filter(function (entry) { return entry.isFile(); })
        .map(function (entry) { return `${directory}/${entry.name}`; }));
}

function assertAllowedChangedPaths(updateType, changedPaths) {
    const normalized = changedPaths.map(normalizedRepositoryPath);
    const allowed = normalized.every(function (file) {
        if (updateType === 'member_status') return file === 'data/members.js';
        if (updateType === 'add_member') return file === 'data/members.js' || /^groups\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp)$/.test(file);
        if (updateType === 'add_publication') return file === 'papers-data.js' || /^files\/images\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp)$/.test(file);
        return false;
    });
    if (!allowed) throw invalid('Update produced an unexpected path.');
    return normalized;
}

function assertExactChangedPaths(expected, actual) {
    const left = expected.map(normalizedRepositoryPath).sort();
    const right = actual.map(normalizedRepositoryPath).sort();
    if (left.length !== right.length || left.some(function (file, index) { return file !== right[index]; })) {
        throw invalid('Working tree contains paths outside this Admin update.');
    }
}

function applyAdminUpdate(value, options) {
    const settings = options || {};
    const repositoryRoot = path.resolve(settings.repositoryRoot || process.cwd());
    const expectedBaseSha = String(settings.expectedBaseSha || '').trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(expectedBaseSha)) throw invalid('Expected main SHA is invalid.');
    const payload = validatePublishPackage(value);
    if (payload.baseCommitSha !== expectedBaseSha) {
        throw invalid('The website changed after this update was prepared. Prepare a new update.');
    }

    let changedPaths;
    let commitMessage;
    const writes = [];

    if (payload.updateType === 'member_status') {
        const dataPath = 'data/members.js';
        const dataFile = safeFilePath(repositoryRoot, dataPath);
        const source = fs.readFileSync(dataFile, 'utf8');
        const records = content.parseMemberRecords(source);
        const member = records.find(function (record) { return record.id === payload.content.id; });
        if (!member) throw invalid('Member record was not found.');
        if (member.status === payload.content.status && member.time === payload.content.time) throw invalid('Member status update makes no change.');
        const nextSource = content.updateMemberRecordSource(source, payload.content);
        writes.push({ file: dataFile, data: nextSource });
        changedPaths = [dataPath];
        commitMessage = `admin: mark member "${content.shortSubject(member.name)}" as ${payload.content.status}`;
    } else if (payload.updateType === 'add_member') {
        const dataPath = 'data/members.js';
        const dataFile = safeFilePath(repositoryRoot, dataPath);
        const source = fs.readFileSync(dataFile, 'utf8');
        if (content.checkMemberDuplicate(content.parseMemberRecords(source), payload.content.draft)) {
            throw invalid('Member already exists.');
        }
        const draft = Object.assign({}, payload.content.draft);
        const imagePath = content.uniquePath(assetPaths(repositoryRoot, 'groups'), 'groups', draft.id, payload.content.image.extension);
        draft.image = `../${imagePath}`;
        const nextSource = content.appendArrayEntry(source, content.memberEntry(draft), 'members');
        writes.push({ file: dataFile, data: nextSource });
        writes.push({ file: safeFilePath(repositoryRoot, imagePath), data: payload.content.image.buffer });
        changedPaths = [dataPath, imagePath].sort();
        commitMessage = `admin: add member "${content.shortSubject(draft.name)}"`;
    } else {
        const dataPath = 'papers-data.js';
        const dataFile = safeFilePath(repositoryRoot, dataPath);
        const source = fs.readFileSync(dataFile, 'utf8');
        if (content.checkPublicationDuplicate(content.parsePublicationRecords(source), payload.content.draft)) {
            throw invalid('Publication already exists.');
        }
        const draft = Object.assign({}, payload.content.draft);
        const stem = content.slugify(draft.title, 'publication');
        const imagePath = content.uniquePath(assetPaths(repositoryRoot, 'files/images'), 'files/images', stem, payload.content.image.extension);
        draft.img = imagePath;
        const nextSource = content.appendArrayEntry(source, content.publicationEntry(draft), 'papers');
        writes.push({ file: dataFile, data: nextSource });
        writes.push({ file: safeFilePath(repositoryRoot, imagePath), data: payload.content.image.buffer });
        changedPaths = [dataPath, imagePath].sort();
        commitMessage = `admin: add publication "${content.shortSubject(draft.title)}"`;
    }

    assertAllowedChangedPaths(payload.updateType, changedPaths);
    writes.forEach(function (write) {
        fs.mkdirSync(path.dirname(write.file), { recursive: true });
        fs.writeFileSync(write.file, write.data);
    });

    return {
        updateId: payload.updateId,
        updateType: payload.updateType,
        baseCommitSha: payload.baseCommitSha,
        commitMessage: commitMessage,
        changedPaths: changedPaths
    };
}

module.exports = {
    PREVIEW_SITE,
    UPDATE_TYPES,
    applyAdminUpdate,
    assertAllowedChangedPaths,
    assertExactChangedPaths,
    validatePublishPackage
};
