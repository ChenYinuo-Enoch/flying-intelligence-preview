'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const updater = require('../scripts/lib/admin-update.js');

const SHA = '1'.repeat(40);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flying-admin-update-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'groups'), { recursive: true });
    fs.mkdirSync(path.join(root, 'files', 'images'), { recursive: true });
    fs.writeFileSync(path.join(root, 'papers-data.js'), 'const papers = [\n    {\n        title: "Existing Paper",\n        url: "https://example.com/existing",\n        venue: "Venue",\n        img: "files/images/existing.png",\n        date: "2026",\n        authors: "Author",\n        tags: ["Low-altitude Perception"],\n        coverPosition: "50% 50%",\n        mediaFitMode: "contain"\n    },\n];\n');
    fs.writeFileSync(path.join(root, 'data', 'members.js'), '// members\nconst members = [\n    {\n        id: "existing-member",\n        type: "member",\n        status: "current",\n        year: 2025,\n        name: "Existing Member",\n        image: "../groups/existing.png",\n        alt: "Existing Member",\n        profileUrl: "",\n        time: "(2025 - Present)",\n        institution: "Institute",\n        research: "Research",\n        email: "member@example.com",\n        links: []\n    },\n];\n');
    fs.writeFileSync(path.join(root, 'groups', 'existing.png'), PNG_BYTES);
    fs.writeFileSync(path.join(root, 'files', 'images', 'existing.png'), PNG_BYTES);
    return root;
}

function image(name) {
    return {
        originalFilename: name,
        mimeType: 'image/png',
        byteLength: PNG_BYTES.length,
        base64: PNG_BYTES.toString('base64')
    };
}

function packageFor(updateType, content, overrides) {
    return Object.assign({
        schemaVersion: 1,
        updateId: '20260818-102030-abc12345',
        updateType: updateType,
        createdAt: '2026-08-18T10:20:30.000Z',
        baseCommitSha: SHA,
        previewSite: 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/',
        targetEnvironment: 'preview',
        content: content
    }, overrides || {});
}

test('applies one member update as an exact data plus image set', function () {
    const root = fixture();
    const result = updater.applyAdminUpdate(packageFor('add_member', {
        draft: {
            type: 'member', year: 2026, name: 'New Member', time: '(2026 - Present)',
            institution: 'Institute', research: 'Robotics', email: 'new@example.com',
            profileUrl: '../person/new-member.html', scholarUrl: ''
        },
        image: image('portrait.png')
    }), { repositoryRoot: root, expectedBaseSha: SHA });

    assert.deepEqual(result.changedPaths, ['data/members.js', 'groups/new-member.png']);
    assert.equal(result.commitMessage, 'admin: add member "New Member"');
    assert.match(fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8'), /name: "New Member"/);
    assert.deepEqual(fs.readFileSync(path.join(root, 'groups', 'new-member.png')), PNG_BYTES);
});

test('applies one publication update as an exact data plus image set', function () {
    const root = fixture();
    const result = updater.applyAdminUpdate(packageFor('add_publication', {
        draft: {
            title: 'New Paper', authors: 'A. Author', date: 'Aug. 2026', venue: 'Conference',
            url: 'https://example.com/new-paper', tags: ['Low-altitude Perception'],
            coverPosition: '50% 50%', mediaFitMode: 'contain', video: ''
        },
        image: image('paper.png')
    }), { repositoryRoot: root, expectedBaseSha: SHA });

    assert.deepEqual(result.changedPaths, ['files/images/new-paper.png', 'papers-data.js']);
    assert.equal(result.commitMessage, 'admin: add publication "New Paper"');
    assert.match(fs.readFileSync(path.join(root, 'papers-data.js'), 'utf8'), /title: "New Paper"/);
});

test('changes status in one data file while preserving raw time text', function () {
    const root = fixture();
    const result = updater.applyAdminUpdate(packageFor('member_status', {
        id: 'existing-member', status: 'former', time: ' (2025 - Aug. 2026) '
    }), { repositoryRoot: root, expectedBaseSha: SHA });

    assert.deepEqual(result.changedPaths, ['data/members.js']);
    assert.equal(result.commitMessage, 'admin: mark member "Existing Member" as former');
    assert.match(fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8'), /time: " \(2025 - Aug\. 2026\) "/);
});

test('rejects invalid schema, unknown types, path-like image names, unsafe images, and former plus present before writing', function () {
    const cases = [
        packageFor('add_member', {}, { schemaVersion: 2 }),
        packageFor('raw_patch', {}),
        packageFor('add_member', { draft: { targetBranch: 'main' }, image: image('portrait.png') }),
        packageFor('add_member', { draft: {}, image: image('../portrait.png') }),
        packageFor('add_member', { draft: {}, image: Object.assign(image('portrait.svg'), { mimeType: 'image/svg+xml' }) }),
        packageFor('member_status', { id: 'existing-member', status: 'former', time: '(2025 - Present)' })
    ];
    cases.forEach(function (payload) {
        const root = fixture();
        const before = fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8');
        assert.throws(function () {
            updater.applyAdminUpdate(payload, { repositoryRoot: root, expectedBaseSha: SHA });
        });
        assert.equal(fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8'), before);
    });
});

test('rejects stale packages and any changed path outside the update allowlist', function () {
    const root = fixture();
    assert.throws(function () {
        updater.applyAdminUpdate(packageFor('member_status', {
            id: 'existing-member', status: 'current', time: '(2025 - Present)'
        }), { repositoryRoot: root, expectedBaseSha: '2'.repeat(40) });
    }, /changed after this update was prepared/i);
    assert.throws(function () {
        updater.assertAllowedChangedPaths('member_status', ['data/members.js', '.github/workflows/pages.yml']);
    }, /unexpected path/i);
});

test('rejects oversized image metadata without allocating image data', function () {
    const payload = packageFor('add_publication', {
        draft: {
            title: 'Large Image Paper', authors: 'A. Author', date: '2026', venue: 'Conference',
            url: 'https://example.com/large-image', tags: ['Low-altitude Perception'],
            coverPosition: '50% 50%', mediaFitMode: 'contain', video: ''
        },
        image: { originalFilename: 'large.png', mimeType: 'image/png', byteLength: 5 * 1024 * 1024 + 1, base64: PNG_BYTES.toString('base64') }
    });
    assert.throws(function () { updater.validatePublishPackage(payload); }, /image size/i);
});
