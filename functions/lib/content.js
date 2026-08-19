'use strict';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', ['.png']],
    ['image/webp', ['.webp']]
]);

function invalid(message) {
    const error = new Error(message);
    error.code = 'invalid-argument';
    return error;
}

function requiredString(value, field, maxLength, allowEmpty) {
    if (typeof value !== 'string') throw invalid(`${field} must be text.`);
    const result = value.trim();
    if (!allowEmpty && !result) throw invalid(`${field} is required.`);
    if (result.length > maxLength) throw invalid(`${field} is too long.`);
    return result;
}

function plainString(value, field, maxLength, allowEmpty) {
    const result = requiredString(value, field, maxLength, allowEmpty);
    if (/[<>]/.test(result) || /(?:javascript\s*:|on[a-z]+\s*=)/i.test(result)) {
        throw invalid(`${field} contains unsupported markup.`);
    }
    return result;
}

function safeHttpUrl(value) {
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
    } catch (error) {
        return false;
    }
}

function safeLinkOrPath(value) {
    if (!value) return true;
    if (safeHttpUrl(value)) return true;
    return /^(?:\.\.?\/|\/)?[A-Za-z0-9_./%?#=&+-]+$/.test(value) &&
        !/^\/\//.test(value) &&
        !/[\r\n\\]/.test(value);
}

function validateAuthorMarkup(value) {
    const authors = requiredString(value, 'Authors', 5000, false);
    let unsafeLink = false;
    const textOnly = authors.replace(/<a href="([^"]{1,2048})">([^<>]*)<\/a>/gi, function (match, href, label) {
        if (!safeLinkOrPath(href) || !label.trim()) unsafeLink = true;
        return label;
    });
    if (unsafeLink || /[<>]/.test(textOnly)) throw invalid('Authors contain unsupported markup.');
    return authors;
}

function slugify(value, fallback) {
    const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return slug || fallback;
}

function splitAndValidateTags(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
        throw invalid('Research directions are required.');
    }
    const tags = Array.from(new Set(value.map(function (tag) {
        return plainString(tag, 'Research direction', 100, false);
    })));
    if (!tags.length) throw invalid('Research directions are required.');
    return tags;
}

function validatePublicationDraft(input) {
    const draft = input && typeof input === 'object' ? input : {};
    const result = {
        title: plainString(draft.title, 'Publication title', 500, false),
        authors: validateAuthorMarkup(draft.authors),
        date: plainString(draft.date, 'Published date', 80, false),
        venue: plainString(draft.venue, 'Venue', 200, false),
        url: requiredString(draft.url, 'Paper or project URL', 2048, false),
        tags: splitAndValidateTags(draft.tags),
        coverPosition: plainString(draft.coverPosition || '50% 50%', 'Cover position', 60, false),
        mediaFitMode: requiredString(draft.mediaFitMode || 'contain', 'Image fit', 12, false),
        video: requiredString(draft.video || '', 'Video', 2048, true)
    };
    if (!safeHttpUrl(result.url)) throw invalid('Paper or project URL is invalid.');
    if (result.video && !safeLinkOrPath(result.video)) throw invalid('Video path is invalid.');
    if (!['contain', 'cover'].includes(result.mediaFitMode)) throw invalid('Image fit is invalid.');
    return result;
}

function validateMemberDraft(input) {
    const draft = input && typeof input === 'object' ? input : {};
    const name = plainString(draft.name, 'Member name', 200, false);
    const type = requiredString(draft.type, 'Member type', 20, false);
    if (!['member', 'advisor'].includes(type)) throw invalid('Member type is invalid.');
    const year = type === 'member' ? Number(draft.year) : null;
    if (type === 'member' && (!Number.isInteger(year) || year < 2000 || year > 2200)) {
        throw invalid('Member year is invalid.');
    }
    const profileUrl = requiredString(draft.profileUrl || '', 'Personal page', 2048, true);
    const scholarUrl = requiredString(draft.scholarUrl || '', 'Scholar link', 2048, true);
    if (!safeLinkOrPath(profileUrl)) throw invalid('Personal page is invalid.');
    if (scholarUrl && !safeHttpUrl(scholarUrl)) throw invalid('Scholar link is invalid.');
    return {
        id: slugify(name, 'member'),
        type: type,
        year: year,
        name: name,
        time: plainString(draft.time || '', 'Time text', 300, true),
        institution: plainString(draft.institution, 'Institution', 1000, false),
        research: plainString(draft.research, 'Research description', 1600, false),
        email: plainString(draft.email, 'Email display text', 300, false),
        profileUrl: profileUrl,
        scholarUrl: scholarUrl
    };
}

function validateMemberStatusUpdate(input) {
    const update = input && typeof input === 'object' ? input : {};
    const id = requiredString(update.id, 'Member id', 100, false);
    const status = requiredString(update.status, 'Member status', 20, false);
    if (!['current', 'former'].includes(status)) throw invalid('Member status is invalid.');
    if (typeof update.time !== 'string') throw invalid('Time text must be text.');
    if (update.time.length > 300) throw invalid('Time text is too long.');
    if (/[<>]/.test(update.time) || /(?:javascript\s*:|on[a-z]+\s*=)/i.test(update.time)) {
        throw invalid('Time text contains unsupported markup.');
    }
    const time = update.time;
    if (status === 'former' && /present/i.test(time)) {
        throw invalid('Remove “present” from the time text before moving this member to Former Members.');
    }
    return { id: id, status: status, time: time };
}

function extensionForImage(fileName, mimeType) {
    const extensions = IMAGE_TYPES.get(mimeType);
    if (!extensions) throw invalid('Image type is invalid.');
    const lowerName = String(fileName || '').toLowerCase();
    const extension = extensions.find(function (candidate) { return lowerName.endsWith(candidate); });
    if (!extension) throw invalid('Image filename does not match its type.');
    return extension;
}

function hasImageSignature(buffer, mimeType) {
    if (mimeType === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/webp') {
        return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
            buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

function validateImage(input) {
    const image = input && typeof input === 'object' ? input : {};
    const name = requiredString(image.name, 'Image filename', 180, false);
    const type = requiredString(image.type, 'Image type', 80, false);
    const extension = extensionForImage(name, type);
    if (typeof image.base64 !== 'string' || !image.base64 || image.base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) {
        throw invalid('Image data is invalid.');
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) || image.base64.length % 4 !== 0) {
        throw invalid('Image data is invalid.');
    }
    const buffer = Buffer.from(image.base64, 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw invalid('Image size is invalid.');
    if (Number(image.size) !== buffer.length) throw invalid('Image size does not match its data.');
    if (!hasImageSignature(buffer, type)) throw invalid('Image content does not match its type.');
    return { name: name, type: type, extension: extension, buffer: buffer };
}

function parseQuotedValue(block, key) {
    const match = block.match(new RegExp(`^\\s*${key}:\\s*["']((?:\\\\.|[^"'\\\\])*)["']`, 'm'));
    if (!match) return '';
    try { return JSON.parse(`"${match[1].replace(/"/g, '\\"')}"`); }
    catch (error) { return match[1]; }
}

function parsePublicationRecords(source) {
    const records = [];
    const blocks = source.match(/^\s{4}\{[\s\S]*?^\s{4}\},?/gm) || [];
    blocks.forEach(function (block) {
        const title = parseQuotedValue(block, 'title');
        if (!title) return;
        records.push({
            title: title,
            url: parseQuotedValue(block, 'url'),
            date: parseQuotedValue(block, 'date')
        });
    });
    return records;
}

function parseMemberRecords(source) {
    const records = [];
    const blocks = source.match(/^\s{4}\{[\s\S]*?^\s{4}\},?/gm) || [];
    blocks.forEach(function (block) {
        const id = parseQuotedValue(block, 'id');
        const name = parseQuotedValue(block, 'name');
        if (id && name) records.push({
            id: id,
            name: name,
            status: parseQuotedValue(block, 'status') || 'current',
            time: parseQuotedValue(block, 'time')
        });
    });
    return records;
}

function updateMemberRecordSource(source, input) {
    if (typeof source !== 'string' || !/const\s+members\s*=\s*\[/.test(source)) {
        throw invalid('members has an unexpected format.');
    }
    const update = validateMemberStatusUpdate(input);
    const blocks = source.matchAll(/^\s{4}\{[\s\S]*?^\s{4}\},?/gm);
    for (const match of blocks) {
        const block = match[0];
        if (parseQuotedValue(block, 'id') !== update.id) continue;
        if (!/^\s*status:\s*["']/m.test(block) || !/^\s*time:\s*["']/m.test(block)) {
            throw invalid('Member record is missing status or time.');
        }
        const nextBlock = block
            .replace(/^(\s*status:\s*)["'](?:\\.|[^"'\\])*["']/m, `$1${JSON.stringify(update.status)}`)
            .replace(/^(\s*time:\s*)["'](?:\\.|[^"'\\])*["']/m, `$1${JSON.stringify(update.time)}`);
        return `${source.slice(0, match.index)}${nextBlock}${source.slice(match.index + block.length)}`;
    }
    throw invalid('Member record was not found.');
}

function checkPublicationDuplicate(records, draft) {
    const year = (draft.date.match(/\b(?:19|20)\d{2}\b/) || [''])[0];
    return records.some(function (record) {
        const existingYear = (record.date.match(/\b(?:19|20)\d{2}\b/) || [''])[0];
        return record.url.toLowerCase() === draft.url.toLowerCase() ||
            (record.title.toLowerCase() === draft.title.toLowerCase() && existingYear === year);
    });
}

function checkMemberDuplicate(records, draft) {
    return records.some(function (record) {
        return record.id === draft.id || record.name.toLowerCase() === draft.name.toLowerCase();
    });
}

function publicationEntry(draft) {
    const lines = [
        '    {',
        `        title: ${JSON.stringify(draft.title)},`,
        `        url: ${JSON.stringify(draft.url)},`,
        `        venue: ${JSON.stringify(draft.venue)},`,
        `        img: ${JSON.stringify(draft.img)},`,
        `        date: ${JSON.stringify(draft.date)},`,
        `        authors: ${JSON.stringify(draft.authors)},`,
        `        tags: ${JSON.stringify(draft.tags)},`
    ];
    if (draft.video) lines.push(`        video: ${JSON.stringify(draft.video)},`);
    lines.push(`        coverPosition: ${JSON.stringify(draft.coverPosition)},`);
    lines.push(`        mediaFitMode: ${JSON.stringify(draft.mediaFitMode)}`);
    lines.push('    },');
    return lines.join('\n');
}

function memberEntry(draft) {
    const links = draft.scholarUrl ? [{ label: 'Google Scholar', url: draft.scholarUrl }] : [];
    const lines = [
        '    {',
        `        id: ${JSON.stringify(draft.id)},`,
        `        type: ${JSON.stringify(draft.type)},`,
        '        status: "current",'
    ];
    if (draft.type === 'member') lines.push(`        year: ${draft.year},`);
    lines.push(`        name: ${JSON.stringify(draft.name)},`);
    lines.push(`        image: ${JSON.stringify(draft.image)},`);
    lines.push(`        alt: ${JSON.stringify(draft.name)},`);
    lines.push(`        profileUrl: ${JSON.stringify(draft.profileUrl)},`);
    lines.push(`        time: ${JSON.stringify(draft.time)},`);
    lines.push(`        institution: ${JSON.stringify(draft.institution)},`);
    lines.push(`        research: ${JSON.stringify(draft.research)},`);
    lines.push(`        email: ${JSON.stringify(draft.email)},`);
    lines.push(`        links: ${JSON.stringify(links, null, 4).replace(/\n/g, '\n        ')}`);
    lines.push('    },');
    return lines.join('\n');
}

function appendArrayEntry(source, entry, variableName) {
    const declaration = typeof source === 'string'
        ? new RegExp(`const\\s+${variableName}\\s*=\\s*\\[`).exec(source)
        : null;
    if (!declaration) {
        throw invalid(`${variableName} has an unexpected format.`);
    }
    const closing = source.lastIndexOf('\n];');
    if (closing < 0) throw invalid(`${variableName} is missing its closing array marker.`);
    const before = source.slice(0, closing);
    const body = source.slice(declaration.index + declaration[0].length, closing).trim();
    const separator = body && !/,\s*$/.test(before) ? ',' : '';
    return `${before}${separator}\n${entry}${source.slice(closing)}`;
}

function uniquePath(existingPaths, directory, stem, extension) {
    let candidate = `${directory}/${stem}${extension}`;
    let suffix = 2;
    while (existingPaths.has(candidate)) {
        candidate = `${directory}/${stem}-${suffix}${extension}`;
        suffix += 1;
    }
    return candidate;
}

function shortSubject(value) {
    return value.length > 62 ? `${value.slice(0, 59)}...` : value;
}

module.exports = {
    MAX_IMAGE_BYTES,
    appendArrayEntry,
    checkMemberDuplicate,
    checkPublicationDuplicate,
    memberEntry,
    parseMemberRecords,
    parsePublicationRecords,
    publicationEntry,
    shortSubject,
    slugify,
    uniquePath,
    validateImage,
    validateMemberDraft,
    validateMemberStatusUpdate,
    validatePublicationDraft,
    updateMemberRecordSource
};
