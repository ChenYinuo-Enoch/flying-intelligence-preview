(function () {
    'use strict';

    const API_ROOT = 'https://api.github.com';
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const IMAGE_TYPES = new Map([
        ['image/jpeg', '.jpg'],
        ['image/png', '.png'],
        ['image/webp', '.webp']
    ]);
    const configuredRepository = document.body.dataset.repository;
    const configuredParent = document.body.dataset.parentRepository;
    const localHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1';
    const dryRun = localHost && new URLSearchParams(location.search).get('dry-run') === '1';

    const elements = {
        token: document.getElementById('github-token'),
        connect: document.getElementById('connect-button'),
        disconnect: document.getElementById('disconnect-button'),
        badge: document.getElementById('connection-badge'),
        authStatus: document.getElementById('auth-status'),
        repositoryStatus: document.getElementById('repository-status'),
        authenticatedUser: document.getElementById('authenticated-user'),
        repositoryName: document.getElementById('repository-name'),
        baseBranch: document.getElementById('base-branch'),
        baseCommit: document.getElementById('base-commit'),
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
        reviewRepository: document.getElementById('review-repository'),
        reviewBase: document.getElementById('review-base'),
        reviewBranch: document.getElementById('review-branch'),
        reviewFiles: document.getElementById('review-files'),
        publish: document.getElementById('publish-button'),
        submitStatus: document.getElementById('submit-status'),
        successPanel: document.getElementById('success-panel'),
        successBranch: document.getElementById('success-branch'),
        successCommit: document.getElementById('success-commit'),
        successPr: document.getElementById('success-pr'),
        successPrLink: document.getElementById('success-pr-link')
    };

    const state = {
        token: '',
        connected: false,
        user: null,
        repository: null,
        baseBranch: '',
        baseSha: '',
        papersSource: '',
        membersSource: '',
        publicationRecords: [],
        memberRecords: [],
        repositoryPaths: new Set(),
        review: null,
        submitting: false,
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

    function clearPreviewUrl(kind) {
        if (state.previewUrls[kind]) URL.revokeObjectURL(state.previewUrls[kind]);
        state.previewUrls[kind] = '';
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

    function apiErrorMessage(error) {
        if (error && error.message) return error.message;
        return 'GitHub request failed.';
    }

    async function githubRequest(path, options) {
        if (!state.token) throw new Error('Connect to GitHub before continuing.');
        const request = options || {};
        const response = await fetch(API_ROOT + path, {
            method: request.method || 'GET',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${state.token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                ...(request.body ? { 'Content-Type': 'application/json' } : {})
            },
            body: request.body ? JSON.stringify(request.body) : undefined
        });
        const text = await response.text();
        let payload = null;
        if (text) {
            try { payload = JSON.parse(text); }
            catch (error) { payload = { message: 'GitHub returned an unreadable response.' }; }
        }
        if (!response.ok) {
            const failure = new Error(payload && payload.message ? payload.message : `GitHub request failed (${response.status}).`);
            failure.status = response.status;
            throw failure;
        }
        return payload;
    }

    function decodeBase64Utf8(value) {
        const binary = atob(String(value || '').replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
        return new TextDecoder().decode(bytes);
    }

    async function readRepositoryFile(path, branch) {
        const payload = await githubRequest(`/repos/${configuredRepository}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
        if (!payload || payload.type !== 'file' || !payload.content) throw new Error(`Required file is unavailable: ${path}`);
        return decodeBase64Utf8(payload.content);
    }

    function encodePath(path) {
        return path.split('/').map(encodeURIComponent).join('/');
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
            if (id && name) records.push({ id: id, name: name });
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

    async function loadDryRunSnapshot() {
        const [papersResponse, membersResponse] = await Promise.all([
            fetch('../papers-data.js', { cache: 'no-store' }),
            fetch('../data/members.js', { cache: 'no-store' })
        ]);
        if (!papersResponse.ok || !membersResponse.ok) throw new Error('Local dry-run data files could not be loaded.');
        return {
            sha: 'dry-run-base-sha',
            papers: await papersResponse.text(),
            members: await membersResponse.text(),
            paths: new Set(['papers-data.js', 'data/members.js'])
        };
    }

    async function loadBaseSnapshot(branch) {
        state.review = null;
        elements.reviewPanel.hidden = true;
        elements.successPanel.hidden = true;
        setStatus(elements.authStatus, 'Loading branch content…', 'loading');
        let snapshot;
        if (dryRun) {
            snapshot = await loadDryRunSnapshot();
        } else {
            const branchInfo = await githubRequest(`/repos/${configuredRepository}/branches/${encodeURIComponent(branch)}`);
            const baseSha = branchInfo.commit.sha;
            const [papers, membersSource, tree] = await Promise.all([
                readRepositoryFile('papers-data.js', branch),
                readRepositoryFile('data/members.js', branch),
                githubRequest(`/repos/${configuredRepository}/git/trees/${baseSha}?recursive=1`)
            ]);
            snapshot = {
                sha: baseSha,
                papers: papers,
                members: membersSource,
                paths: new Set((tree.tree || []).map(function (entry) { return entry.path; }))
            };
        }
        state.baseBranch = branch;
        state.baseSha = snapshot.sha;
        state.papersSource = snapshot.papers;
        state.membersSource = snapshot.members;
        state.publicationRecords = parsePublicationRecords(snapshot.papers);
        state.memberRecords = parseMemberRecords(snapshot.members);
        state.repositoryPaths = snapshot.paths;
        elements.baseCommit.textContent = snapshot.sha;
        populateDirections(snapshot.papers);
        setStatus(elements.authStatus, `Ready: ${state.publicationRecords.length} publications and ${state.memberRecords.length} members loaded from ${branch}.`, 'success');
    }

    async function connect() {
        if (state.submitting) return;
        const token = elements.token.value.trim();
        if (!dryRun && !token) {
            setStatus(elements.authStatus, 'Enter a GitHub fine-grained token.', 'error');
            elements.token.focus();
            return;
        }
        elements.connect.disabled = true;
        setConnectionState('Validating', 'loading');
        setStatus(elements.authStatus, 'Validating GitHub identity and repository write permission…', 'loading');
        state.token = token;
        try {
            let user;
            let repository;
            let branches;
            if (dryRun) {
                user = { login: 'local-dry-run' };
                repository = {
                    full_name: configuredRepository,
                    default_branch: 'fix/publication-title-and-direction-arrows',
                    fork: true,
                    parent: { full_name: configuredParent },
                    permissions: { push: true }
                };
                branches = [{ name: repository.default_branch }];
            } else {
                [user, repository, branches] = await Promise.all([
                    githubRequest('/user'),
                    githubRequest(`/repos/${configuredRepository}`),
                    githubRequest(`/repos/${configuredRepository}/branches?per_page=100`)
                ]);
                const expectedRepository = repository.full_name.toLowerCase() === configuredRepository.toLowerCase();
                const expectedParent = repository.fork && repository.parent && repository.parent.full_name.toLowerCase() === configuredParent.toLowerCase();
                if (!expectedRepository || !expectedParent) throw new Error('The configured repository is not the expected Flying Intelligence fork.');
                if (!repository.permissions || repository.permissions.push !== true) throw new Error('This token does not have write permission for the configured fork.');
            }

            state.connected = true;
            state.user = user;
            state.repository = repository;
            elements.token.value = '';
            elements.authenticatedUser.textContent = user.login;
            elements.repositoryName.textContent = repository.full_name;
            elements.baseBranch.replaceChildren();
            branches.forEach(function (branch) {
                const option = document.createElement('option');
                option.value = branch.name;
                option.textContent = branch.name;
                option.selected = branch.name === repository.default_branch;
                elements.baseBranch.appendChild(option);
            });
            elements.repositoryStatus.hidden = false;
            elements.workspace.hidden = false;
            elements.connect.hidden = true;
            elements.disconnect.hidden = false;
            setConnectionState(dryRun ? 'Dry-run connected' : 'Connected', 'connected');
            await loadBaseSnapshot(elements.baseBranch.value);
        } catch (error) {
            state.token = '';
            state.connected = false;
            state.user = null;
            state.repository = null;
            elements.token.value = '';
            elements.workspace.hidden = true;
            elements.repositoryStatus.hidden = true;
            elements.connect.hidden = false;
            elements.disconnect.hidden = true;
            setConnectionState('Error', 'error');
            setStatus(elements.authStatus, apiErrorMessage(error), 'error');
        } finally {
            elements.connect.disabled = false;
        }
    }

    function disconnect() {
        state.token = '';
        state.connected = false;
        state.user = null;
        state.repository = null;
        state.review = null;
        state.baseSha = '';
        state.papersSource = '';
        state.membersSource = '';
        state.repositoryPaths = new Set();
        elements.token.value = '';
        elements.workspace.hidden = true;
        elements.repositoryStatus.hidden = true;
        elements.reviewPanel.hidden = true;
        elements.successPanel.hidden = true;
        elements.connect.hidden = false;
        elements.disconnect.hidden = true;
        setConnectionState('Not connected', 'idle');
        setStatus(elements.authStatus, 'Disconnected. The in-memory token has been cleared.', 'success');
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
        const documentFragment = new DOMParser().parseFromString(`<div>${value}</div>`, 'text/html');
        const source = documentFragment.body.firstElementChild;
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
                    link.setAttribute('href', href);
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
        const name = file.name.toLowerCase();
        const allowedExtension = /\.(?:jpe?g|png|webp)$/.test(name);
        if (!IMAGE_TYPES.has(file.type) || !allowedExtension) errors.push('Image must be a JPG, PNG, or WebP file.');
        if (file.size > MAX_IMAGE_BYTES) errors.push('Image must be 5 MB or smaller.');
        if (file.size <= 0) errors.push('Image file is empty.');
        return errors;
    }

    function slugify(value, fallback) {
        const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
        return slug || fallback;
    }

    function fileExtension(file) {
        if (file.type === 'image/jpeg') return /\.jpeg$/i.test(file.name) ? '.jpeg' : '.jpg';
        return IMAGE_TYPES.get(file.type) || '';
    }

    function uniqueRepositoryPath(directory, stem, extension) {
        let candidate = `${directory}/${stem}${extension}`;
        let suffix = 2;
        while (state.repositoryPaths.has(candidate)) {
            candidate = `${directory}/${stem}-${suffix}${extension}`;
            suffix += 1;
        }
        return candidate;
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
        if (draft.video && !safeLinkOrPath(draft.video)) errors.push('Video must be a valid HTTP(S) URL or repository-relative path.');
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
        if (!safeLinkOrPath(profileUrl)) errors.push('Personal page must be a valid HTTP(S) URL or repository-relative path.');
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

    function timestamp() {
        const now = new Date();
        const pad = function (value) { return String(value).padStart(2, '0'); };
        return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    }

    function contentBranch(kind) {
        const random = Math.random().toString(36).slice(2, 6);
        return `content/${kind}-${timestamp()}-${random}`;
    }

    function prepareReview(kind, draft) {
        const isPublication = kind === 'publication';
        const extension = fileExtension(draft.imageFile);
        const stem = slugify(isPublication ? draft.title : draft.name, isPublication ? 'publication' : 'member');
        const imageRepositoryPath = uniqueRepositoryPath(isPublication ? 'files/images' : 'groups', stem, extension);
        draft.imageRepositoryPath = imageRepositoryPath;
        if (isPublication) draft.img = imageRepositoryPath;
        else draft.image = `../${imageRepositoryPath}`;

        state.review = {
            kind: kind,
            draft: draft,
            baseBranch: state.baseBranch,
            baseSha: state.baseSha,
            branch: contentBranch(kind),
            files: [
                { path: isPublication ? 'papers-data.js' : 'data/members.js', action: 'modify' },
                { path: imageRepositoryPath, action: 'add' }
            ]
        };
        elements.reviewRepository.textContent = configuredRepository;
        elements.reviewBase.textContent = `${state.baseBranch} @ ${state.baseSha.slice(0, 12)}`;
        elements.reviewBranch.textContent = state.review.branch;
        elements.reviewFiles.replaceChildren();
        state.review.files.forEach(function (file) {
            const item = document.createElement('li');
            item.textContent = `${file.action.toUpperCase()}  ${file.path}`;
            elements.reviewFiles.appendChild(item);
        });
        elements.reviewPanel.hidden = false;
        elements.successPanel.hidden = true;
        elements.publish.disabled = false;
        setStatus(elements.submitStatus, '', '');
        elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function invalidateReview(kind) {
        if (!state.review || (kind && state.review.kind !== kind)) return;
        state.review = null;
        elements.reviewPanel.hidden = true;
        elements.successPanel.hidden = true;
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
            `        type: ${JSON.stringify(draft.type)},`
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
        if (!new RegExp(`const\\s+${variableName}\\s*=\\s*\\[`).test(source)) throw new Error(`The ${variableName} data source has an unexpected format.`);
        const closing = source.lastIndexOf('\n];');
        if (closing < 0) throw new Error(`The ${variableName} data source is missing its closing array marker.`);
        return `${source.slice(0, closing)}\n${entry}${source.slice(closing)}`;
    }

    function fileAsBase64(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
            reader.onerror = function () { reject(new Error('The selected image could not be read.')); };
            reader.readAsDataURL(file);
        });
    }

    function shortSubject(value) {
        return value.length > 62 ? `${value.slice(0, 59)}…` : value;
    }

    async function latestBaseSha() {
        if (dryRun) return state.baseSha;
        const branch = await githubRequest(`/repos/${configuredRepository}/branches/${encodeURIComponent(state.review.baseBranch)}`);
        return branch.commit.sha;
    }

    async function submitReview() {
        if (!state.connected || !state.review || state.submitting) return;
        state.submitting = true;
        elements.publish.disabled = true;
        setStatus(elements.submitStatus, 'Rechecking the base branch before creating the content commit…', 'loading');
        let branchCreated = false;
        let submissionClosed = false;
        try {
            const currentBaseSha = await latestBaseSha();
            if (currentBaseSha !== state.review.baseSha) {
                throw new Error('The base branch changed after preview. Reload the branch data and review the change again.');
            }

            const review = state.review;
            const isPublication = review.kind === 'publication';
            const updatedSource = isPublication
                ? appendArrayEntry(state.papersSource, publicationEntry(review.draft), 'papers')
                : appendArrayEntry(state.membersSource, memberEntry(review.draft), 'members');
            const dataPath = isPublication ? 'papers-data.js' : 'data/members.js';
            const imageContent = await fileAsBase64(review.draft.imageFile);

            if (dryRun) {
                const generated = {
                    base: review.baseBranch,
                    head: review.branch,
                    files: review.files.map(function (file) { return file.path; }),
                    dataBytes: new TextEncoder().encode(updatedSource).length,
                    imageBytes: review.draft.imageFile.size
                };
                showSuccess(review.branch, `dry-run-${generated.dataBytes}-${generated.imageBytes}`, null);
                setStatus(elements.submitStatus, 'Dry run complete. No GitHub mutation request was sent.', 'success');
                submissionClosed = true;
                return;
            }

            setStatus(elements.submitStatus, 'Creating content blobs and an atomic commit…', 'loading');
            const baseCommit = await githubRequest(`/repos/${configuredRepository}/git/commits/${review.baseSha}`);
            const [dataBlob, imageBlob] = await Promise.all([
                githubRequest(`/repos/${configuredRepository}/git/blobs`, {
                    method: 'POST',
                    body: { content: updatedSource, encoding: 'utf-8' }
                }),
                githubRequest(`/repos/${configuredRepository}/git/blobs`, {
                    method: 'POST',
                    body: { content: imageContent, encoding: 'base64' }
                })
            ]);
            const tree = await githubRequest(`/repos/${configuredRepository}/git/trees`, {
                method: 'POST',
                body: {
                    base_tree: baseCommit.tree.sha,
                    tree: [
                        { path: dataPath, mode: '100644', type: 'blob', sha: dataBlob.sha },
                        { path: review.draft.imageRepositoryPath, mode: '100644', type: 'blob', sha: imageBlob.sha }
                    ]
                }
            });
            const subject = isPublication ? shortSubject(review.draft.title) : review.draft.name;
            const commitMessage = isPublication ? `content: add publication "${subject}"` : `content: add member "${subject}"`;
            const commit = await githubRequest(`/repos/${configuredRepository}/git/commits`, {
                method: 'POST',
                body: { message: commitMessage, tree: tree.sha, parents: [review.baseSha] }
            });
            await githubRequest(`/repos/${configuredRepository}/git/refs`, {
                method: 'POST',
                body: { ref: `refs/heads/${review.branch}`, sha: commit.sha }
            });
            branchCreated = true;
            setStatus(elements.submitStatus, 'Content branch created. Opening Pull Request…', 'loading');
            const title = isPublication ? `content: add publication ${review.draft.title}` : `content: add member ${review.draft.name}`;
            const pullRequest = await githubRequest(`/repos/${configuredRepository}/pulls`, {
                method: 'POST',
                body: {
                    title: title,
                    head: review.branch,
                    base: review.baseBranch,
                    body: [
                        `Type: ${isPublication ? 'Publication' : 'Member'}`,
                        `Name: ${isPublication ? review.draft.title : review.draft.name}`,
                        `Base branch: ${review.baseBranch}`,
                        'Changed files:',
                        ...review.files.map(function (file) { return `- ${file.path}`; }),
                        '',
                        'Generated by Flying Intelligence Admin.'
                    ].join('\n')
                }
            });
            showSuccess(review.branch, commit.sha, pullRequest);
            setStatus(elements.submitStatus, 'Pull Request created. Review and merge it on GitHub when ready.', 'success');
            submissionClosed = true;
        } catch (error) {
            const prefix = branchCreated ? `The content branch ${state.review.branch} was created, but Pull Request creation failed. ` : '';
            setStatus(elements.submitStatus, prefix + apiErrorMessage(error), 'error');
            submissionClosed = branchCreated;
        } finally {
            state.submitting = false;
            elements.publish.disabled = submissionClosed;
        }
    }

    function showSuccess(branch, commit, pullRequest) {
        elements.successBranch.textContent = branch;
        elements.successCommit.textContent = commit;
        if (pullRequest) {
            elements.successPr.textContent = `#${pullRequest.number}`;
            elements.successPrLink.href = pullRequest.html_url;
            elements.successPrLink.hidden = false;
        } else {
            elements.successPr.textContent = 'DRY RUN — no Pull Request created';
            elements.successPrLink.hidden = true;
        }
        elements.successPanel.hidden = false;
        elements.successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function activateTab(kind) {
        invalidateReview();
        const publication = kind === 'publication';
        elements.publicationTab.setAttribute('aria-selected', String(publication));
        elements.memberTab.setAttribute('aria-selected', String(!publication));
        elements.publicationPanel.hidden = !publication;
        elements.memberPanel.hidden = publication;
        (publication ? elements.publicationPanel : elements.memberPanel).focus({ preventScroll: true });
    }

    function updateMemberType() {
        const member = elements.memberType.value === 'member';
        elements.memberYearField.hidden = !member;
        elements.memberYear.required = member;
        elements.memberYear.disabled = !member;
        if (!member) elements.memberYear.value = '';
        invalidateReview('member');
    }

    elements.connect.addEventListener('click', connect);
    elements.disconnect.addEventListener('click', disconnect);
    elements.baseBranch.addEventListener('change', async function () {
        try { await loadBaseSnapshot(elements.baseBranch.value); }
        catch (error) { setStatus(elements.authStatus, apiErrorMessage(error), 'error'); }
    });
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
    elements.publish.addEventListener('click', submitReview);

    window.addEventListener('pagehide', function () {
        state.token = '';
        clearPreviewUrl('publication');
        clearPreviewUrl('member');
    });

    if (dryRun) {
        elements.connect.textContent = 'Connect dry-run fixture';
        elements.token.required = false;
        setStatus(elements.authStatus, 'Local dry-run mode is available. It never sends GitHub mutation requests.', 'success');
    }
    updateMemberType();
}());
