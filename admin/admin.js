(function () {
    'use strict';

    const SESSION_KEY = 'adminUnlocked';
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const authSettings = window.FLYING_INTELLIGENCE_SIMPLE_AUTH || {};
    const authApi = window.FLYING_INTELLIGENCE_SIMPLE_AUTH_API;

    const elements = {
        signInForm: document.getElementById('sign-in-form'),
        account: document.getElementById('account'),
        password: document.getElementById('password'),
        signIn: document.getElementById('sign-in-button'),
        signOut: document.getElementById('sign-out-button'),
        signedInRow: document.getElementById('signed-in-row'),
        badge: document.getElementById('connection-badge'),
        authStatus: document.getElementById('auth-status'),
        workspace: document.getElementById('admin-workspace'),
        publicationTab: document.getElementById('publication-tab'),
        memberTab: document.getElementById('member-tab'),
        publicationPanel: document.getElementById('publication-panel'),
        memberPanel: document.getElementById('member-panel'),
        publicationForm: document.getElementById('publication-form'),
        memberForm: document.getElementById('member-form'),
        publicationErrors: document.getElementById('publication-errors'),
        memberErrors: document.getElementById('member-errors'),
        publicationPreview: document.getElementById('publication-preview'),
        publicationPreviewEmpty: document.getElementById('publication-preview-empty'),
        publicationPreviewImage: document.getElementById('publication-preview-image'),
        publicationPreviewMeta: document.getElementById('publication-preview-meta'),
        publicationPreviewHeading: document.getElementById('publication-preview-heading'),
        publicationPreviewAuthors: document.getElementById('publication-preview-authors'),
        publicationPreviewTags: document.getElementById('publication-preview-tags'),
        memberPreview: document.getElementById('member-preview'),
        memberPreviewEmpty: document.getElementById('member-preview-empty'),
        memberPreviewImage: document.getElementById('member-preview-image'),
        memberPreviewGroup: document.getElementById('member-preview-group'),
        memberPreviewName: document.getElementById('member-preview-name'),
        memberPreviewTime: document.getElementById('member-preview-time'),
        memberPreviewInstitution: document.getElementById('member-preview-institution'),
        memberPreviewResearch: document.getElementById('member-preview-research'),
        memberPreviewEmail: document.getElementById('member-preview-email'),
        memberPreviewLinks: document.getElementById('member-preview-links'),
        memberType: document.getElementById('member-type'),
        memberYear: document.getElementById('member-year'),
        memberYearField: document.getElementById('member-year-field'),
        directionOptions: document.getElementById('research-direction-options'),
        reviewPanel: document.getElementById('review-panel'),
        reviewType: document.getElementById('review-type'),
        reviewName: document.getElementById('review-name'),
        reviewTarget: document.getElementById('review-target'),
        reviewImage: document.getElementById('review-image'),
        preparedOutput: document.getElementById('prepared-output'),
        previewUpdate: document.getElementById('preview-update-button'),
        submitStatus: document.getElementById('submit-status'),
        successPanel: document.getElementById('success-panel')
    };

    const state = {
        authorized: false,
        review: null,
        publicationRecords: [],
        memberRecords: [],
        imagePaths: new Set(),
        previewUrls: { publication: '', member: '' }
    };

    function setStatus(element, message, status) {
        element.textContent = message || '';
        if (status) element.dataset.state = status;
        else delete element.dataset.state;
    }

    function setConnectionState(label, status) {
        elements.badge.textContent = label;
        elements.badge.dataset.state = status;
    }

    function showErrors(container, errors) {
        container.replaceChildren();
        if (!errors.length) {
            container.hidden = true;
            return;
        }
        const list = document.createElement('ul');
        errors.forEach(function (message) {
            const item = document.createElement('li');
            item.textContent = message;
            list.appendChild(item);
        });
        container.appendChild(list);
        container.hidden = false;
    }

    function clearPreviewUrl(kind) {
        if (state.previewUrls[kind]) URL.revokeObjectURL(state.previewUrls[kind]);
        state.previewUrls[kind] = '';
    }

    function resetProtectedState() {
        state.authorized = false;
        state.review = null;
        state.publicationRecords = [];
        state.memberRecords = [];
        state.imagePaths = new Set();
        elements.workspace.hidden = true;
        elements.reviewPanel.hidden = true;
        elements.successPanel.hidden = true;
    }

    function renderSignedOut(message) {
        resetProtectedState();
        elements.signInForm.hidden = false;
        elements.signedInRow.hidden = true;
        elements.password.value = '';
        elements.signIn.disabled = !authApi || !authApi.isConfigured(authSettings);
        setConnectionState('Signed out', 'idle');
        setStatus(elements.authStatus, message || 'Enter the configured local administrator credentials.', message ? 'error' : '');
    }

    function renderAuthorized() {
        state.authorized = true;
        elements.signInForm.hidden = true;
        elements.signedInRow.hidden = false;
        elements.signIn.disabled = false;
        setConnectionState('Authorized', 'connected');
        setStatus(elements.authStatus, 'Local administrator access unlocked for this browser tab.', 'success');
    }

    function sessionUnlocked() {
        try { return window.sessionStorage.getItem(SESSION_KEY) === 'true'; }
        catch (error) { return false; }
    }

    function setSessionUnlocked(unlocked) {
        try {
            if (unlocked) window.sessionStorage.setItem(SESSION_KEY, 'true');
            else window.sessionStorage.removeItem(SESSION_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function loadContentSnapshot() {
        const responses = await Promise.all([
            fetch('../papers-data.js', { cache: 'no-store' }),
            fetch('../data/members.js', { cache: 'no-store' })
        ]);
        if (!responses[0].ok || !responses[1].ok) throw new Error('snapshot-unavailable');
        const papersSource = await responses[0].text();
        const membersSource = await responses[1].text();
        state.publicationRecords = parsePublicationRecords(papersSource);
        state.memberRecords = parseMemberRecords(membersSource);
        state.imagePaths = new Set(state.publicationRecords.map(function (record) { return record.img; })
            .concat(state.memberRecords.map(function (record) { return record.image; })).filter(Boolean));
        populateDirections(papersSource);
    }

    async function initializeAuthentication() {
        if (!authApi || !authApi.isConfigured(authSettings)) {
            elements.signIn.disabled = true;
            setConnectionState('Setup required', 'idle');
            setStatus(elements.authStatus, 'Administrator credentials have not been configured yet.', 'error');
            return;
        }

        elements.signIn.disabled = false;
        if (!sessionUnlocked()) {
            renderSignedOut();
            return;
        }
        try {
            await loadContentSnapshot();
            renderAuthorized();
            elements.workspace.hidden = false;
        } catch (error) {
            setSessionUnlocked(false);
            renderSignedOut('Unable to load the current website data.');
        }
    }

    async function signIn(event) {
        event.preventDefault();
        const account = elements.account.value.trim();
        const password = elements.password.value;
        if (!account || !password) {
            setStatus(elements.authStatus, 'Enter your account and password.', 'error');
            return;
        }

        elements.signIn.disabled = true;
        setConnectionState('Signing in', 'loading');
        setStatus(elements.authStatus, 'Checking local credentials.', '');
        try {
            const valid = await authApi.verifyCredentials(authSettings, account, password);
            if (!valid || !setSessionUnlocked(true)) throw new Error('invalid-credentials');
            await loadContentSnapshot();
            renderAuthorized();
            elements.workspace.hidden = false;
        } catch (error) {
            setSessionUnlocked(false);
            renderSignedOut('Unable to sign in with this account.');
        } finally {
            elements.password.value = '';
            if (!state.authorized) elements.signIn.disabled = false;
        }
    }

    async function signOut() {
        resetProtectedState();
        setSessionUnlocked(false);
        renderSignedOut();
    }

    function parseQuotedValue(block, key) {
        const match = block.match(new RegExp(`^\\s*${key}:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'm'));
        if (!match) return '';
        try { return JSON.parse(`"${match[1]}"`); }
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
                date: parseQuotedValue(block, 'date'),
                img: parseQuotedValue(block, 'img')
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
            if (id && name) records.push({ id: id, name: name, image: parseQuotedValue(block, 'image') });
        });
        return records;
    }

    function parseResearchDirections(source) {
        const directions = new Set();
        const matches = source.matchAll(/tags:\s*\[([^\]]*)\]/g);
        for (const match of matches) {
            for (const value of match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)) {
                try { directions.add(JSON.parse(`"${value[1]}"`)); }
                catch (error) { directions.add(value[1]); }
            }
        }
        return Array.from(directions).sort();
    }

    function populateDirections(source) {
        elements.directionOptions.replaceChildren();
        parseResearchDirections(source).forEach(function (direction) {
            const option = document.createElement('option');
            option.value = direction;
            elements.directionOptions.appendChild(option);
        });
    }

    function safeHttpUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:';
        } catch (error) {
            return false;
        }
    }

    function safeLinkOrPath(value) {
        if (!value) return true;
        if (safeHttpUrl(value)) return true;
        return /^(?:\.\.?\/|\/)?[A-Za-z0-9_./%?#=&+-]+$/.test(value) && !/^\/\//.test(value);
    }

    function sanitizeAuthorMarkup(value) {
        const parsed = new DOMParser().parseFromString(`<div>${value}</div>`, 'text/html');
        const source = parsed.body.firstElementChild;
        const output = document.createElement('div');
        Array.from(source.childNodes).forEach(function (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                output.appendChild(document.createTextNode(node.textContent));
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
                const href = node.getAttribute('href') || '';
                if (safeLinkOrPath(href)) {
                    const link = document.createElement('a');
                    link.href = href;
                    link.textContent = node.textContent;
                    output.appendChild(link);
                    return;
                }
            }
            output.appendChild(document.createTextNode(node.textContent || ''));
        });
        return output.innerHTML.trim();
    }

    function validateImage(file) {
        const errors = [];
        if (!file) return ['Select an image file.'];
        if (!IMAGE_TYPES.has(file.type) || !/\.(?:jpe?g|png|webp)$/i.test(file.name)) errors.push('Image must be a JPG, PNG, or WebP file.');
        if (file.size > MAX_IMAGE_BYTES) errors.push('Image must be 5 MB or smaller.');
        if (file.size <= 0) errors.push('Image file is empty.');
        return errors;
    }

    function slugify(value, fallback) {
        const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
        return slug || fallback;
    }

    function splitTags(value) {
        return Array.from(new Set(value.split(/[,\n]/).map(function (tag) { return tag.trim(); }).filter(Boolean)));
    }

    function publicationDraft() {
        const errors = [];
        const image = document.getElementById('publication-image').files[0];
        const draft = {
            title: document.getElementById('publication-title').value.trim(),
            authors: sanitizeAuthorMarkup(document.getElementById('publication-authors').value.trim()),
            date: document.getElementById('publication-date').value.trim(),
            venue: document.getElementById('publication-venue').value.trim(),
            url: document.getElementById('publication-url').value.trim(),
            tags: splitTags(document.getElementById('publication-tags').value),
            coverPosition: document.getElementById('publication-cover-position').value.trim() || '50% 50%',
            mediaFitMode: document.getElementById('publication-fit').value,
            video: document.getElementById('publication-video').value.trim(),
            imageFile: image
        };
        if (!draft.title) errors.push('Publication title is required.');
        if (!draft.authors) errors.push('Authors are required.');
        if (!draft.date) errors.push('Published date is required.');
        if (!draft.venue) errors.push('Venue is required.');
        if (!safeHttpUrl(draft.url)) errors.push('Paper or project URL must be a valid HTTP or HTTPS URL.');
        if (!draft.tags.length) errors.push('At least one research direction is required.');
        if (draft.video && !safeLinkOrPath(draft.video)) errors.push('Video must be a valid HTTP(S) URL or site-relative path.');
        errors.push.apply(errors, validateImage(image));
        const year = (draft.date.match(/\b(?:19|20)\d{2}\b/) || [''])[0];
        const duplicate = state.publicationRecords.find(function (record) {
            const existingYear = (record.date.match(/\b(?:19|20)\d{2}\b/) || [''])[0];
            return record.url.toLowerCase() === draft.url.toLowerCase() ||
                (record.title.toLowerCase() === draft.title.toLowerCase() && existingYear === year);
        });
        if (duplicate) errors.push(`Possible duplicate publication: ${duplicate.title}`);
        return { draft: draft, errors: errors };
    }

    function memberDraft() {
        const errors = [];
        const type = elements.memberType.value;
        const image = document.getElementById('member-image').files[0];
        const name = document.getElementById('member-name').value.trim();
        const yearText = elements.memberYear.value.trim();
        const profileUrl = document.getElementById('member-profile').value.trim();
        const scholarUrl = document.getElementById('member-scholar').value.trim();
        const draft = {
            id: slugify(name, 'member'),
            type: type,
            year: type === 'member' ? Number(yearText) : null,
            name: name,
            time: document.getElementById('member-time').value.trim(),
            institution: document.getElementById('member-institution').value.trim(),
            research: document.getElementById('member-research').value.trim(),
            email: document.getElementById('member-email').value.trim(),
            profileUrl: profileUrl,
            scholarUrl: scholarUrl,
            imageFile: image
        };
        if (!draft.name) errors.push('Member name is required.');
        if (type === 'member' && !/^\d{4}$/.test(yearText)) errors.push('Member year must contain exactly four digits.');
        if (!draft.institution) errors.push('Institution is required.');
        if (!draft.research) errors.push('Research description is required.');
        if (!draft.email) errors.push('Email display text is required.');
        if (!safeLinkOrPath(profileUrl)) errors.push('Personal page must be a valid HTTP(S) URL or site-relative path.');
        if (scholarUrl && !safeHttpUrl(scholarUrl)) errors.push('Scholar link must be a valid HTTP or HTTPS URL.');
        errors.push.apply(errors, validateImage(image));
        const duplicate = state.memberRecords.find(function (member) {
            return member.id === draft.id || member.name.toLowerCase() === draft.name.toLowerCase();
        });
        if (duplicate) errors.push(`Possible duplicate member: ${duplicate.name}`);
        return { draft: draft, errors: errors };
    }

    function setImagePreview(kind, file, imageElement, alt) {
        clearPreviewUrl(kind);
        const url = URL.createObjectURL(file);
        state.previewUrls[kind] = url;
        imageElement.src = url;
        imageElement.alt = alt;
    }

    function renderPublicationPreview(draft) {
        setImagePreview('publication', draft.imageFile, elements.publicationPreviewImage, draft.title);
        elements.publicationPreviewMeta.textContent = `${draft.date} / ${draft.venue}`;
        elements.publicationPreviewHeading.textContent = draft.title;
        elements.publicationPreviewAuthors.innerHTML = draft.authors;
        elements.publicationPreviewTags.replaceChildren();
        draft.tags.forEach(function (tag) {
            const item = document.createElement('span');
            item.textContent = tag;
            elements.publicationPreviewTags.appendChild(item);
        });
        elements.publicationPreviewEmpty.hidden = true;
        elements.publicationPreview.hidden = false;
    }

    function renderMemberPreview(draft) {
        setImagePreview('member', draft.imageFile, elements.memberPreviewImage, draft.name);
        elements.memberPreviewGroup.textContent = draft.type === 'advisor' ? 'TEAM ADVISOR' : String(draft.year);
        elements.memberPreviewName.textContent = draft.name;
        elements.memberPreviewTime.textContent = draft.time;
        elements.memberPreviewInstitution.textContent = draft.institution;
        elements.memberPreviewResearch.textContent = draft.research;
        elements.memberPreviewEmail.textContent = draft.email;
        elements.memberPreviewLinks.replaceChildren();
        [
            { label: 'Personal page', url: draft.profileUrl },
            { label: 'Google Scholar', url: draft.scholarUrl }
        ].forEach(function (link) {
            if (!link.url) return;
            const anchor = document.createElement('a');
            anchor.href = link.url;
            anchor.textContent = link.label;
            elements.memberPreviewLinks.appendChild(anchor);
        });
        elements.memberPreviewEmpty.hidden = true;
        elements.memberPreview.hidden = false;
    }

    function imageExtension(file) {
        const match = file.name.toLowerCase().match(/\.(?:jpe?g|png|webp)$/);
        return match ? match[0] : '';
    }

    function publicationEntry(draft, imagePath) {
        const lines = [
            '    {',
            `        title: ${JSON.stringify(draft.title)},`,
            `        url: ${JSON.stringify(draft.url)},`,
            `        venue: ${JSON.stringify(draft.venue)},`,
            `        img: ${JSON.stringify(imagePath)},`,
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

    function memberEntry(draft, imagePath) {
        const links = draft.scholarUrl ? [{ label: 'Google Scholar', url: draft.scholarUrl }] : [];
        const lines = [
            '    {',
            `        id: ${JSON.stringify(draft.id)},`,
            `        type: ${JSON.stringify(draft.type)},`
        ];
        if (draft.type === 'member') lines.push(`        year: ${draft.year},`);
        lines.push(`        name: ${JSON.stringify(draft.name)},`);
        lines.push(`        image: ${JSON.stringify(imagePath)},`);
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

    function uniqueImagePath(directory, stem, extension) {
        let path = `${directory}/${stem}${extension}`;
        let suffix = 2;
        while (state.imagePaths.has(path)) {
            path = `${directory}/${stem}-${suffix}${extension}`;
            suffix += 1;
        }
        return path;
    }

    function buildPreparedUpdate(kind, draft) {
        const stem = slugify(kind === 'publication' ? draft.title : draft.name, kind);
        const extension = imageExtension(draft.imageFile);
        const imagePath = kind === 'publication'
            ? uniqueImagePath('files/images', stem, extension)
            : uniqueImagePath('../groups', stem, extension);
        return {
            dataPath: kind === 'publication' ? 'papers-data.js' : 'data/members.js',
            imagePath: imagePath,
            imageSummary: `${draft.imageFile.name} (${draft.imageFile.type}, ${draft.imageFile.size} bytes) -> ${imagePath}`,
            entry: kind === 'publication' ? publicationEntry(draft, imagePath) : memberEntry(draft, imagePath)
        };
    }

    function prepareReview(kind, draft) {
        const prepared = buildPreparedUpdate(kind, draft);
        state.review = { kind: kind, draft: draft, prepared: prepared };
        elements.reviewType.textContent = kind === 'publication' ? 'Publication' : 'Member';
        elements.reviewName.textContent = kind === 'publication' ? draft.title : draft.name;
        elements.reviewTarget.textContent = prepared.dataPath;
        elements.reviewImage.textContent = prepared.imageSummary;
        elements.preparedOutput.textContent = prepared.entry;
        elements.reviewPanel.hidden = false;
        elements.successPanel.hidden = true;
        elements.previewUpdate.disabled = false;
        setStatus(elements.submitStatus, '', '');
        elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function invalidateReview(kind) {
        if (!state.review || (kind && state.review.kind !== kind)) return;
        state.review = null;
        elements.reviewPanel.hidden = true;
        elements.successPanel.hidden = true;
    }

    function previewUpdate() {
        if (!state.authorized || !state.review) return;
        elements.successPanel.hidden = false;
        setStatus(elements.submitStatus, 'Preview ready. No website files or remote content have been changed.', 'success');
        elements.successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function activateTab(kind) {
        invalidateReview();
        const publication = kind === 'publication';
        elements.publicationTab.setAttribute('aria-selected', String(publication));
        elements.memberTab.setAttribute('aria-selected', String(!publication));
        elements.publicationPanel.hidden = !publication;
        elements.memberPanel.hidden = publication;
    }

    function updateMemberType() {
        const member = elements.memberType.value === 'member';
        elements.memberYearField.hidden = !member;
        elements.memberYear.required = member;
        elements.memberYear.disabled = !member;
        if (!member) elements.memberYear.value = '';
        invalidateReview('member');
    }

    elements.signInForm.addEventListener('submit', signIn);
    elements.signOut.addEventListener('click', signOut);
    elements.publicationTab.addEventListener('click', function () { activateTab('publication'); });
    elements.memberTab.addEventListener('click', function () { activateTab('member'); });
    elements.memberType.addEventListener('change', updateMemberType);

    elements.publicationForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const result = publicationDraft();
        showErrors(elements.publicationErrors, result.errors);
        if (result.errors.length) return;
        renderPublicationPreview(result.draft);
        prepareReview('publication', result.draft);
    });

    elements.memberForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const result = memberDraft();
        showErrors(elements.memberErrors, result.errors);
        if (result.errors.length) return;
        renderMemberPreview(result.draft);
        prepareReview('member', result.draft);
    });

    elements.publicationForm.addEventListener('input', function () { invalidateReview('publication'); });
    elements.memberForm.addEventListener('input', function () { invalidateReview('member'); });
    elements.publicationForm.addEventListener('reset', function () {
        window.setTimeout(function () {
            clearPreviewUrl('publication');
            elements.publicationPreview.hidden = true;
            elements.publicationPreviewEmpty.hidden = false;
            showErrors(elements.publicationErrors, []);
            invalidateReview('publication');
        }, 0);
    });
    elements.memberForm.addEventListener('reset', function () {
        window.setTimeout(function () {
            clearPreviewUrl('member');
            elements.memberPreview.hidden = true;
            elements.memberPreviewEmpty.hidden = false;
            showErrors(elements.memberErrors, []);
            updateMemberType();
            invalidateReview('member');
        }, 0);
    });
    elements.previewUpdate.addEventListener('click', previewUpdate);

    window.addEventListener('pagehide', function () {
        elements.password.value = '';
        clearPreviewUrl('publication');
        clearPreviewUrl('member');
    });

    updateMemberType();
    initializeAuthentication();
}());
