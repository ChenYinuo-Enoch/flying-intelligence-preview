'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../lib/content');

test('validates and serializes a publication without changing its fields', function () {
    const draft = content.validatePublicationDraft({
        title: 'Safe Flight Research',
        authors: '<a href="group.html#researcher">Researcher</a>, Collaborator',
        date: 'Aug. 2026',
        venue: 'Test Venue',
        url: 'https://example.org/paper',
        tags: ['Low-altitude Perception'],
        coverPosition: '50% 50%',
        mediaFitMode: 'contain',
        video: ''
    });
    draft.img = 'files/images/safe-flight-research.png';
    const entry = content.publicationEntry(draft);
    assert.match(entry, /Safe Flight Research/);
    assert.match(entry, /Low-altitude Perception/);
    assert.doesNotMatch(entry, /<script/i);
});

test('rejects unsupported author markup and unsafe links', function () {
    assert.throws(function () {
        content.validatePublicationDraft({
            title: 'Unsafe',
            authors: '<img src=x onerror=alert(1)>',
            date: 'Aug. 2026',
            venue: 'Venue',
            url: 'https://example.org/paper',
            tags: ['Direction'],
            mediaFitMode: 'contain'
        });
    }, /unsupported markup/);
});

test('verifies image type, size, extension, and signature', function () {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const image = content.validateImage({
        name: 'figure.png',
        type: 'image/png',
        size: bytes.length,
        base64: bytes.toString('base64')
    });
    assert.equal(image.extension, '.png');
    assert.deepEqual(image.buffer, bytes);
    assert.throws(function () {
        content.validateImage({
            name: 'figure.png',
            type: 'image/png',
            size: 3,
            base64: Buffer.from('bad').toString('base64')
        });
    }, /does not match/);
});

test('rejects duplicate publications and members', function () {
    assert.equal(content.checkPublicationDuplicate([
        { title: 'Existing', url: 'https://example.org/one', date: '2026' }
    ], { title: 'Existing', url: 'https://example.org/two', date: 'Aug. 2026' }), true);
    assert.equal(content.checkMemberDuplicate([
        { id: 'existing-member', name: 'Existing Member' }
    ], { id: 'existing-member', name: 'Another Name' }), true);
});

test('generates a non-conflicting repository path', function () {
    const paths = new Set(['groups/new-member.png', 'groups/new-member-2.png']);
    assert.equal(content.uniquePath(paths, 'groups', 'new-member', '.png'), 'groups/new-member-3.png');
});

test('rejects stored HTML and event handler payloads in plain text fields', function () {
    assert.throws(function () {
        content.validatePublicationDraft({
            title: '<img src=x onerror=alert(1)>',
            authors: 'Researcher',
            date: 'Aug. 2026',
            venue: 'Venue',
            url: 'https://example.org/paper',
            tags: ['Direction'],
            mediaFitMode: 'contain'
        });
    }, /unsupported markup/);
    assert.throws(function () {
        content.validateMemberDraft({
            type: 'member',
            year: 2026,
            name: 'Member',
            time: '',
            institution: 'Institute onclick=alert(1)',
            research: 'Research',
            email: 'member@example.org',
            profileUrl: '',
            scholarUrl: ''
        });
    }, /unsupported markup/);
});

test('parses member status and time for management without evaluating source', function () {
    const source = `const members = [
    {
        id: "sample-member",
        type: "member",
        year: 2026,
        status: "former",
        name: "Sample Member",
        time: " (Jan 2026 - Aug 2026) ",
        links: []
    },
];
`;
    assert.deepEqual(content.parseMemberRecords(source), [{
        id: 'sample-member',
        name: 'Sample Member',
        status: 'former',
        time: ' (Jan 2026 - Aug 2026) '
    }]);
});

test('rejects marking a member former while time still says present', function () {
    assert.throws(function () {
        content.validateMemberStatusUpdate({
            id: 'sample-member',
            status: 'former',
            time: ' (Jan 2026 - Present) '
        });
    }, /Remove “present” from the time text before moving this member to Former Members\./);
});

test('updates only status and time in the selected member source record', function () {
    const source = `const members = [
    {
        id: "first-member",
        status: "current",
        name: "First Member",
        time: " (2025 - present) ",
        institution: "Original Institution"
    },
    {
        id: "second-member",
        status: "current",
        name: "Second Member",
        time: " (2026 - present) ",
        institution: "Keep This Institution"
    },
];
`;
    const updated = content.updateMemberRecordSource(source, {
        id: 'second-member',
        status: 'former',
        time: ' (2026 - Aug. 2026) '
    });
    assert.match(updated, /id: "first-member",[\s\S]*status: "current",[\s\S]*time: " \(2025 - present\) "/);
    assert.match(updated, /id: "second-member",[\s\S]*status: "former",[\s\S]*time: " \(2026 - Aug\. 2026\) "/);
    assert.match(updated, /institution: "Keep This Institution"/);
});

test('serializes every newly added member as current', function () {
    const entry = content.memberEntry({
        id: 'new-member',
        type: 'member',
        year: 2026,
        name: 'New Member',
        image: '../groups/new-member.png',
        profileUrl: '',
        time: ' (Aug. 2026 - present) ',
        institution: 'Institution',
        research: 'Research',
        email: 'member@example.org',
        scholarUrl: ''
    });
    assert.match(entry, /status: "current",/);
});
