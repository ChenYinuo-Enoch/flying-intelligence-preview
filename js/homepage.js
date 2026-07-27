// Homepage paper storytelling. The paper data remains owned by papers-data.js.

document.addEventListener('DOMContentLoaded', function () {
    if (typeof papers === 'undefined' || typeof tagColors === 'undefined') {
        console.warn('Paper data not loaded. Papers data:', typeof papers, 'Tag colors:', typeof tagColors);
        const container = document.querySelector('[data-papers-container]');
        if (container) container.innerHTML = '<div class="text-danger">Paper data not loaded.</div>';
    } else {
        renderPapers();
    }

    updateYear();
});

function renderPapers() {
    const container = document.querySelector('[data-papers-container]');
    if (!container) return;

    container.innerHTML = papers.map(function (paper, index) {
        const demoId = 'demo-' + index;
        const processedAuthors = paper.authors.replace(/href="group.html/g, 'href="pages/group.html');
        const paperNumber = String(index + 1).padStart(2, '0');
        const media = paper.img
            ? `<div class="paper-image-wrapper"><img src="${paper.img}" alt="${paper.title}" class="paper-architecture-img" loading="lazy" decoding="async"></div>`
            : '<div class="paper-image-placeholder">No Image</div>';

        return `
            <article class="paper-achievement-card" data-paper-index="${index}">
                <div class="paper-sequence" aria-hidden="true">RESEARCH / ${paperNumber}</div>
                <div class="paper-achievement-row">
                    <div class="paper-achievement-left">
                        <div class="paper-meta-line">
                            ${paper.date ? `<span>${paper.date}</span>` : ''}
                            ${paper.venue ? `<span>${paper.venue}</span>` : ''}
                        </div>
                        <h3 class="paper-title">${paper.title}</h3>
                        <p class="paper-authors">${processedAuthors}</p>
                        <a href="${paper.url}" target="_blank" rel="noopener noreferrer" class="paper-learn-more-btn" data-cursor="OPEN">Learn More</a>
                    </div>
                    <div class="paper-achievement-right" data-cursor="VIEW">
                        <div class="paper-image-container" id="${demoId}--content" ${paper.video ? 'hidden' : ''}>${media}</div>
                        ${paper.video ? `<div class="paper-video-container" id="${demoId}--video"><video playsinline autoplay muted loop preload="metadata" class="paper-demo-video"><source src="${paper.video}" type="video/mp4">Your browser does not support the video tag.</video></div>` : ''}
                        <div class="paper-achievement-info">
                            <div class="paper-tags">
                                ${paper.tags.map(function (tag) { return `<a href="pages/direction_papers.html?direction=${encodeURIComponent(tag)}" class="paper-tag-btn" style="background:${tagColors[tag] || '#888'};">${tag}</a>`; }).join('')}
                            </div>
                            ${paper.video ? `<button type="button" class="paper-demo-btn" aria-controls="${demoId}--content ${demoId}--video" aria-pressed="false" onclick="toggleDemo('${demoId}', this)">Architecture</button>` : ''}
                        </div>
                    </div>
                </div>
            </article>`;
    }).join('');

    if (typeof window.Plyr === 'function') {
        document.querySelectorAll('.paper-demo-video').forEach(function (video) {
            new window.Plyr(video, {
                autoplay: true,
                loop: { active: true },
                muted: true,
                controls: []
            });
        });
    }
}

function toggleDemo(demoId, button) {
    const content = document.getElementById(demoId + '--content');
    const video = document.getElementById(demoId + '--video');
    if (!content || !video || !button) return;

    const showArchitecture = !content.hidden;
    content.hidden = showArchitecture;
    video.hidden = !showArchitecture;
    button.textContent = showArchitecture ? 'Architecture' : 'View Demo';
    button.setAttribute('aria-pressed', String(showArchitecture));
}

function updateYear() {
    const yearElement = document.getElementById('current-year');
    if (yearElement) yearElement.textContent = new Date().getFullYear();
}
