// Render structured member data without changing the existing Group card design.
(function (root, factory) {
    'use strict';

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FLYING_INTELLIGENCE_GROUP_MEMBERS = Object.freeze(api);
    if (root && root.document) {
        const records = typeof members !== 'undefined' && Array.isArray(members) ? members : [];
        api.renderGroup(root.document, records);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function linkMarkup(url, content) {
        if (!url) return content;
        return `<a href="${escapeHtml(url)}">${content}</a>`;
    }

    function memberCard(member) {
        const classes = member.type === 'advisor' ? 'member-card advisor-card' : 'member-card';
        const image = `<img src="${escapeHtml(member.image)}" alt="${escapeHtml(member.alt || member.name)}">`;
        const imageMarkup = member.type === 'advisor' && member.profileUrl
            ? linkMarkup(member.profileUrl, image)
            : image;
        const name = linkMarkup(member.profileUrl, escapeHtml(member.name));
        const details = [member.time, member.institution, member.research, member.email]
            .filter(function (value) { return value !== undefined && value !== null && value !== ''; })
            .map(function (value) { return `<span class="d-block">${escapeHtml(value)}</span>`; })
            .join('');
        const links = (member.links || []).map(function (link) {
            return `<a href="${escapeHtml(link.url)}" style="margin: 5px 0; color: #007bff; text-decoration: underline;">${escapeHtml(link.label)}</a>`;
        }).join('');

        return `
            <div class="${classes}" id="${escapeHtml(member.id)}">
                <div class="card">
                    ${imageMarkup}
                    <div class="post-meta">
                        <span class="d-block" style="padding-top:10px"><b class="member-name">${name}</b></span>
                        ${details}
                        ${links}
                    </div>
                </div>
            </div>`;
    }

    function buildGroupMarkup(records) {
        const currentMembers = records.filter(function (member) { return (member.status || 'current') === 'current'; });
        const formerMembers = records.filter(function (member) { return member.status === 'former'; });
        const advisors = currentMembers.filter(function (member) { return member.type === 'advisor'; });
        const years = Array.from(new Set(currentMembers
            .filter(function (member) { return member.type === 'member'; })
            .map(function (member) { return Number(member.year); })
            .filter(function (year) { return Number.isInteger(year); })))
            .sort(function (a, b) { return a - b; });

        const navigation = years.map(function (year) {
            return `<a href="#group-${year}-heading">${year}</a>`;
        }).join('');
        const yearSections = years.map(function (year) {
            const cards = currentMembers
                .filter(function (member) { return member.type === 'member' && Number(member.year) === year; })
                .map(memberCard)
                .join('');
            return `
                <section class="group-section" aria-labelledby="group-${year}-heading">
                    <h3 class="group-section-heading" id="group-${year}-heading">${year}</h3>
                    <div class="member-grid">${cards}</div>
                </section>`;
        }).join('');

        const formerSection = formerMembers.length ? `
            <section class="group-section former-members-section" aria-labelledby="former-members-heading">
                <h3 class="group-section-heading" id="former-members-heading">Former Members</h3>
                <div class="member-grid">${formerMembers.map(memberCard).join('')}</div>
            </section>` : '';

        return `
            <div class="section-title group-page-title">
                <h2>Team Members</h2>
                <nav class="group-year-navigation" aria-label="Member year navigation">${navigation}</nav>
            </div>
            <section class="group-section" aria-labelledby="faculty-advisor-heading">
                <h3 class="group-section-heading" id="faculty-advisor-heading">TEAM ADVISOR</h3>
                <div class="member-grid advisor-grid">${advisors.map(memberCard).join('')}</div>
            </section>
            ${yearSections}
            ${formerSection}`;
    }

    function renderGroup(documentRef, records) {
        const container = documentRef.querySelector('.group-page .person-card#people');
        if (!container || !Array.isArray(records)) return;
        container.innerHTML = buildGroupMarkup(records);
    }

    return {
        buildGroupMarkup: buildGroupMarkup,
        renderGroup: renderGroup
    };
}));
