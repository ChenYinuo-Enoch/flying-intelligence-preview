'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.document = { querySelector: function () { return null; } };
const groupMembers = require('../js/group-members.js');
delete global.document;

const sampleMembers = [
    { id: 'advisor', type: 'advisor', status: 'current', name: 'Advisor', image: 'advisor.jpg', time: '', institution: 'A', research: 'R', email: 'a@example.org', links: [] },
    { id: 'current-member', type: 'member', year: 2025, status: 'current', name: 'Current Member', image: 'current.jpg', time: '2025 - present', institution: 'A', research: 'R', email: 'c@example.org', links: [] },
    { id: 'former-member', type: 'member', year: 2025, status: 'former', name: 'Former Member', image: 'former.jpg', time: '2025 - 2026', institution: 'A', research: 'R', email: 'f@example.org', links: [] }
];

test('omits the Former Members section while every member is current', function () {
    assert.equal(typeof groupMembers.buildGroupMarkup, 'function');
    const markup = groupMembers.buildGroupMarkup(sampleMembers.slice(0, 2));
    assert.doesNotMatch(markup, />Former Members</);
    assert.match(markup, /id="current-member"/);
});

test('moves former records out of current years and renders them once after current sections', function () {
    assert.equal(typeof groupMembers.buildGroupMarkup, 'function');
    const markup = groupMembers.buildGroupMarkup(sampleMembers);
    const yearSection = markup.slice(markup.indexOf('group-2025-heading'), markup.indexOf('former-members-heading'));
    const formerSection = markup.slice(markup.indexOf('former-members-heading'));
    assert.doesNotMatch(yearSection, /id="former-member"/);
    assert.match(formerSection, />Former Members</);
    assert.equal((markup.match(/id="former-member"/g) || []).length, 1);
    assert.ok(markup.indexOf('former-members-heading') > markup.indexOf('group-2025-heading'));
});
