// Publication archive. Source data remains in papers-data.js.

document.addEventListener('DOMContentLoaded', function () {
    const container = document.querySelector('[data-papers-container]');
    if (typeof papers === 'undefined') {
        console.warn('Paper data not loaded.');
        if (container) container.innerHTML = '<div class="text-center py-5"><p class="text-danger">Paper data not loaded.</p></div>';
        return;
    }

    setupPublicationFilters();
    renderPublicationPapers(papers);
});

function publicationYear(paper) {
    const match = String(paper.date || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
}

function setupPublicationFilters() {
    const yearSelect = document.getElementById('publication-year-filter');
    const directionSelect = document.getElementById('publication-direction-filter');
    if (!yearSelect || !directionSelect) return;

    const years = Array.from(new Set(papers.map(publicationYear).filter(Boolean))).sort().reverse();
    const directions = Array.from(new Set(papers.reduce(function (all, paper) {
        return all.concat(paper.tags || []);
    }, []))).sort();

    years.forEach(function (year) {
        yearSelect.insertAdjacentHTML('beforeend', `<option value="${year}">${year}</option>`);
    });
    directions.forEach(function (direction) {
        directionSelect.insertAdjacentHTML('beforeend', `<option value="${direction}">${direction}</option>`);
    });

    function applyFilters() {
        const selectedYear = yearSelect.value;
        const selectedDirection = directionSelect.value;
        const filtered = papers.filter(function (paper) {
            const matchesYear = selectedYear === 'all' || publicationYear(paper) === selectedYear;
            const matchesDirection = selectedDirection === 'all' || (paper.tags || []).includes(selectedDirection);
            return matchesYear && matchesDirection;
        });
        renderPublicationPapers(filtered);
    }

    yearSelect.addEventListener('change', applyFilters);
    directionSelect.addEventListener('change', applyFilters);
}

function renderPublicationPapers(items) {
    const container = document.querySelector('[data-papers-container]');
    if (!container) return;

    container.innerHTML = items.map(function (paper) {
        const imgPath = paper.img ? (paper.img.startsWith('http') ? paper.img : '../' + paper.img) : '';
        const tags = (paper.tags || []).map(function (tag) {
            return `<a href="direction_papers.html?direction=${encodeURIComponent(tag)}">${tag}</a>`;
        }).join('');

        return `
            <article class="publication-entry">
                <div class="publication-entry__media" data-cursor="VIEW">
                    ${imgPath ? `<img src="${imgPath}" alt="${paper.title}" loading="lazy" decoding="async">` : ''}
                </div>
                <div class="publication-entry__content">
                    <div class="publication-entry__meta">${paper.date || ''}${paper.venue ? ` / ${paper.venue}` : ''}</div>
                    <h3 class="publication-entry__title"><a href="${paper.url}" target="_blank" rel="noopener noreferrer" data-cursor="OPEN">${paper.title}</a></h3>
                    <p class="publication-entry__authors">${paper.authors}</p>
                </div>
                <div class="publication-entry__tags">${tags}</div>
            </article>`;
    }).join('');
}
