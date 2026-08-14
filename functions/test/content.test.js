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
