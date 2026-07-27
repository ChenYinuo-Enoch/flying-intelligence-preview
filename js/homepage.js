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

    container.classList.add('research-records');

    container.innerHTML = papers.map(function (paper, index) {
        const demoId = 'demo-' + index;
        const processedAuthors = paper.authors.replace(/href="group.html/g, 'href="pages/group.html');
        const paperNumber = String(index + 1).padStart(2, '0');
        const comicCover = comicCoverFor(paper.img);
        const category = (paper.tags && paper.tags[0]) || '';
        const tagLinks = (paper.tags || []).map(function (tag) {
            return `<a href="pages/direction_papers.html?direction=${encodeURIComponent(tag)}">${tag}</a>`;
        }).join('');

        return `
            <article class="research-record" data-paper-index="${index}">
                <div class="record-stage">
                    <div class="vinyl-disc" aria-hidden="true"></div>
                    <div class="record-card">
                        <div class="record-face record-front" aria-hidden="false">
                            <div class="record-sleeve">
                                <img src="${comicCover}" alt="Comic-style cover derived from ${paper.title}" class="record-comic-cover" loading="lazy" decoding="async">
                                <span class="record-number" aria-hidden="true">RESEARCH / ${paperNumber}</span>
                                ${category ? `<span class="record-category">${category}</span>` : ''}
                            </div>
                        </div>
                        <div class="record-face record-back" aria-hidden="true">
                            <div class="record-original-media" data-cursor="VIEW">
                                <div id="${demoId}--content" class="record-original-content">
                                    <img src="${paper.img}" alt="${paper.title}" class="record-original-image" loading="lazy" decoding="async">
                                </div>
                                ${paper.video ? `<div id="${demoId}--video" class="record-video-content" hidden><video playsinline muted loop preload="metadata" class="record-demo-video"><source src="${paper.video}" type="video/mp4">Your browser does not support the video tag.</video></div>` : ''}
                            </div>
                            <div class="record-back-copy">
                                <div class="record-meta">${paper.date || ''}${paper.venue ? ` / ${paper.venue}` : ''}</div>
                                <h3 class="record-title">${paper.title}</h3>
                                <div class="record-actions">
                                    <button type="button" class="record-close">Close</button>
                                    ${paper.video ? `<button type="button" class="record-demo-btn" data-record-demo="${demoId}" aria-controls="${demoId}--content ${demoId}--video" aria-pressed="false">View Demo</button>` : ''}
                                    <a href="${paper.url}" target="_blank" rel="noopener noreferrer" class="record-learn-more" data-cursor="OPEN">Learn More</a>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="record-flip-control" aria-expanded="false" aria-label="Open ${paper.title}"></button>
                    </div>
                </div>
                <div class="record-summary">
                    <h3 class="record-summary-title">${paper.title}</h3>
                    <div class="record-meta">${paper.date || ''}${paper.venue ? ` / ${paper.venue}` : ''}</div>
                    <p class="record-authors">${processedAuthors}</p>
                    <div class="record-tags">${tagLinks}</div>
                </div>
            </article>`;
    }).join('');

    if (typeof window.Plyr === 'function') {
        document.querySelectorAll('.record-demo-video').forEach(function (video) {
            new window.Plyr(video, {
                autoplay: false,
                loop: { active: true },
                muted: true,
                controls: []
            });
        });
    }
}

function comicCoverFor(imagePath) {
    if (!imagePath) return '';
    const filename = imagePath.split('/').pop() || '';
    const slug = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `files/research-records/comic/${slug}-comic.webp`;
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

    const media = video.querySelector('video');
    if (!media) return;
    if (showArchitecture) {
        const playResult = media.play();
        if (playResult && typeof playResult.catch === 'function') playResult.catch(function () {});
    } else {
        media.pause();
    }
}

function updateYear() {
    const yearElement = document.getElementById('current-year');
    if (yearElement) yearElement.textContent = new Date().getFullYear();
}
