// Person Page Papers Rerendering Logic

document.addEventListener('DOMContentLoaded', function () {
    const authorEl = document.getElementById('author-id');
    if (!authorEl) {
        console.warn('Author ID element not found.');
        return;
    }

    const targetId = authorEl.getAttribute('data-id');
    const container = document.getElementById('papers-list');

    if (typeof papers === 'undefined') {
        if (container) {
            container.innerHTML = '<div class="col-md-12 text-center py-5"><p class="text-danger">Paper data not loaded.</p></div>';
        }
        return;
    }

    renderPersonPapers(targetId, container);
});

function renderPersonPapers(targetId, container) {
    if (!container) return;

    const filteredPapers = papers.filter(paper => {
        return paper.authors.includes(`group.html#${targetId}`);
    });

    if (filteredPapers.length === 0) {
        container.innerHTML = `
            <div class="col-md-12 mb-3">
                <div class="card h-100 shadow-sm">
                    <div class="card-body d-flex flex-column text-center">
                        <p class="card-text py-4 text-muted">（暂无收录论文）</p>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    filteredPapers.forEach(paper => {
        const imgPath = paper.img ? (paper.img.startsWith('http') ? paper.img : '../' + paper.img) : '';
        const processedAuthors = paper.authors.replace(/href="group.html/g, 'href="../pages/group.html');

        html += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm paper-card" style="transition: transform 0.3s; border: none; border-radius: 12px; overflow: hidden;">
                    ${imgPath ? `<div style="height: 160px; overflow: hidden; background: #f8f9fa;">
                        <img src="${imgPath}" class="card-img-top" style="width: 100%; height: 100%; object-fit: cover;" alt="${paper.title}">
                    </div>` : ''}
                    <div class="card-body d-flex flex-column" style="padding: 1.25rem;">
                        <h6 class="card-title" style="font-weight: 700; line-height: 1.4; margin-bottom: 0.75rem;">
                            <a href="${paper.url}" target="_blank" style="color: #2563eb; text-decoration: none;">${paper.title}</a>
                        </h6>
                        <div class="mb-2">
                            <span class="badge badge-light" style="color: #666; font-weight: 500;">${paper.venue || ''}</span>
                            <span class="text-muted small ml-2">${paper.date || ''}</span>
                        </div>
                        <p class="card-text small text-muted mb-0" style="font-size: 0.85em; line-height: 1.5;">
                            ${processedAuthors}
                        </p>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}
