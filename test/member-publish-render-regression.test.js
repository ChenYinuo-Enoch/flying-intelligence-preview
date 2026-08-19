'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const content = require('../functions/lib/content.js');
const updater = require('../scripts/lib/admin-update.js');

global.document = { querySelector: function () { return null; } };
const groupMembers = require('../js/group-members.js');
delete global.document;

const SHA = '1'.repeat(40);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function evaluateMembers(source) {
    const sandbox = {};
    vm.runInNewContext(`${source}\nthis.__members = members;`, sandbox, { filename: 'data/members.js' });
    return sandbox.__members;
}

function renderedCardCount(markup) {
    return (markup.match(/class="member-card(?: advisor-card)?"/g) || []).length;
}

function baselineRecords() {
    return Array.from({ length: 13 }, function (_, index) {
        const advisor = index === 0;
        return {
            id: advisor ? 'advisor' : `existing-member-${index}`,
            type: advisor ? 'advisor' : 'member',
            year: advisor ? null : (index > 10 ? 2026 : 2025),
            name: advisor ? 'Existing Advisor' : `Existing Member ${index}`,
            image: advisor ? '../groups/advisor.png' : `../groups/existing-${index}.png`,
            profileUrl: '',
            time: advisor ? '' : '(2025 - Present)',
            institution: 'Institute',
            research: 'Research',
            email: advisor ? 'advisor@example.com' : `member-${index}@example.com`,
            scholarUrl: ''
        };
    });
}

function sourceWithoutTrailingComma(records) {
    const entries = records.map(function (record, index) {
        const entry = content.memberEntry(record);
        return index === records.length - 1 ? entry.replace(/,\s*$/, '') : entry;
    });
    return `const members = [\n${entries.join('\n')}\n];\n`;
}

function publishPackage() {
    return {
        schemaVersion: 1,
        updateId: '20260819-020839-regression',
        updateType: 'add_member',
        createdAt: '2026-08-19T02:08:39.000Z',
        baseCommitSha: SHA,
        previewSite: 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/',
        targetEnvironment: 'preview',
        content: {
            draft: {
                type: 'member',
                year: 2026,
                name: 'Yinuo Chen',
                time: '(Summer 2026 - Present)',
                institution: 'Wenzhou-Kean University',
                research: 'LLM - Human-Machine Interactive',
                email: 'chenyinoc@gmail.com',
                profileUrl: '',
                scholarUrl: ''
            },
            image: {
                originalFilename: 'portrait.png',
                mimeType: 'image/png',
                byteLength: PNG_BYTES.length,
                base64: PNG_BYTES.toString('base64')
            }
        }
    };
}

test('current production member data renders all 14 cards', function () {
    const source = fs.readFileSync(path.join(__dirname, '..', 'data', 'members.js'), 'utf8');
    const records = evaluateMembers(source);
    const markup = groupMembers.buildGroupMarkup(records);

    assert.equal(records.length, 14);
    assert.equal(renderedCardCount(markup), 14);
    assert.match(markup, />TEAM ADVISOR</);
    assert.match(markup, /id="group-2025-heading"/);
    assert.match(markup, /id="group-2026-heading"/);
    assert.match(markup, />Yinuo Chen</);
});

test('add member keeps 13 existing records and renders 14 cards without a trailing baseline comma', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flying-member-render-regression-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'groups'), { recursive: true });
    const existing = baselineRecords();
    fs.writeFileSync(path.join(root, 'data', 'members.js'), sourceWithoutTrailingComma(existing));

    updater.applyAdminUpdate(publishPackage(), { repositoryRoot: root, expectedBaseSha: SHA });

    const records = evaluateMembers(fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8'));
    const markup = groupMembers.buildGroupMarkup(records);
    assert.equal(records.length, 14);
    assert.equal(renderedCardCount(markup), 14);
    existing.forEach(function (member) { assert.match(markup, new RegExp(`>${member.name}<`)); });
    assert.match(markup, />Yinuo Chen</);
});

test('add member rejects invalid executable member data before writing any file', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flying-member-render-invalid-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'groups'), { recursive: true });
    const validSource = sourceWithoutTrailingComma(baselineRecords());
    const invalidSource = validSource.replace(/\n    },\n    \{\n/, '\n    }\n    {\n');
    fs.writeFileSync(path.join(root, 'data', 'members.js'), invalidSource);

    assert.throws(function () {
        updater.applyAdminUpdate(publishPackage(), { repositoryRoot: root, expectedBaseSha: SHA });
    }, /members data is invalid/i);
    assert.equal(fs.readFileSync(path.join(root, 'data', 'members.js'), 'utf8'), invalidSource);
    assert.equal(fs.existsSync(path.join(root, 'groups', 'yinuo-chen.png')), false);
});
