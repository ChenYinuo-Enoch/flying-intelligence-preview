// Homepage paper storytelling. The paper data remains owned by papers-data.js.

(function () {
    'use strict';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeIndex = 0;
    let detailIndex = -1;
    let stage = null;
    let status = null;
    let records = [];
    let dragStartX = 0;
    let dragMoved = false;
    let wheelLocked = false;
    let detailReturnFocus = null;
    let detailFlipTimer = 0;
    let detailFocusTimer = 0;

    function relativeOffset(index) {
        const total = records.length;
        let offset = index - activeIndex;
        if (offset > total / 2) offset -= total;
        if (offset < -total / 2) offset += total;
        return offset;
    }

    function recordPosition(offset) {
        const compact = window.innerWidth < 900;
        const step = compact
            ? Math.min(window.innerWidth * 0.82, 330)
            : Math.min(window.innerWidth * 0.36, 520);
        const distance = Math.abs(offset);
        return {
            x: offset * step,
            y: offset === 0 ? -10 : (offset % 2 ? 32 : -26) + distance * 6,
            z: offset === 0 ? 180 : 40 - distance * 24,
            rotate: offset * (compact ? 3.8 : 4.8),
            scale: offset === 0 ? 1 : Math.max(0.56, 0.8 - distance * 0.08),
            opacity: distance > 2 ? 0 : Math.max(0.34, 0.82 - distance * 0.2),
            layer: 20 - distance
        };
    }

    function videoFor(record) {
        return record ? record.querySelector('video') : null;
    }

    function setVideoState(record, shouldPlay) {
        const video = videoFor(record);
        if (!video) return;
        if (shouldPlay) {
            const playResult = video.play();
            if (playResult && typeof playResult.then === 'function') {
                playResult.then(function () {
                    record.classList.add('is-video-playing');
                }).catch(function () {
                    record.classList.remove('is-video-playing');
                });
            }
        } else {
            video.pause();
            record.classList.remove('is-video-playing');
        }
    }

    function updateRecords(options) {
        const focusActive = options && options.focusActive;
        records.forEach(function (record, index) {
            const offset = relativeOffset(index);
            const position = recordPosition(offset);
            const active = offset === 0;
            record.style.setProperty('--record-x', `${position.x}px`);
            record.style.setProperty('--record-y', `${position.y}px`);
            record.style.setProperty('--record-z', `${position.z}px`);
            record.style.setProperty('--record-rotate', `${position.rotate}deg`);
            record.style.setProperty('--record-scale', position.scale);
            record.style.setProperty('--record-opacity', position.opacity);
            record.style.setProperty('--record-layer', position.layer);
            record.classList.toggle('is-active', active);
            record.setAttribute('aria-hidden', String(Math.abs(offset) > 2));
            const cover = record.querySelector('.research-record__cover');
            if (cover) {
                cover.tabIndex = Math.abs(offset) <= 1 ? 0 : -1;
                cover.setAttribute('aria-current', active ? 'true' : 'false');
                cover.setAttribute('aria-expanded', String(detailIndex === index));
            }
            setVideoState(record, active);
        });
        if (status) status.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
        if (focusActive && records[activeIndex]) records[activeIndex].querySelector('.research-record__cover').focus();
    }

    function setActive(nextIndex, options) {
        const total = records.length;
        activeIndex = (nextIndex + total) % total;
        updateRecords(options);
    }

    function processAuthors(authors) {
        return (authors || '').replace(/href="group\.html/g, 'href="pages/group.html');
    }

    function tagLinks(paper) {
        return (paper.tags || []).map(function (tag) {
            return `<a href="pages/direction_papers.html?direction=${encodeURIComponent(tag)}">${tag}</a>`;
        }).join('');
    }

    function paperMedia(paper) {
        return `
            <div class="research-record__media">
                <img src="${paper.img}" alt="" loading="lazy" decoding="async">
                ${paper.video ? `<video muted loop playsinline preload="metadata" poster="${paper.img}"><source src="${paper.video}" type="video/mp4"></video>` : ''}
            </div>`;
    }

    function renderPapers() {
        const container = document.querySelector('[data-papers-container]');
        if (!container) return;
        container.className = 'research-airspace-stage';
        container.tabIndex = 0;
        container.setAttribute('role', 'region');
        container.setAttribute('aria-roledescription', 'research project carousel');
        container.setAttribute('aria-label', 'Recent Research. Use left and right arrow keys to browse.');
        container.innerHTML = `
            <p class="research-airspace-help">Drag / swipe / use arrow keys to navigate · Open the centered project for details</p>
            ${papers.map(function (paper, index) {
                return `
                    <article class="research-record" data-paper-index="${index}">
                        <button class="research-record__cover" id="research-cover-${index + 1}" type="button"
                            aria-label="Open ${paper.title}" aria-controls="research-detail" aria-expanded="false">
                            ${paperMedia(paper)}
                        </button>
                        <div class="research-record__summary" aria-live="${index === 0 ? 'polite' : 'off'}">
                            <h3>${paper.title}</h3>
                            <p>${paper.date || ''}${paper.venue ? ` / ${paper.venue}` : ''}</p>
                        </div>
                    </article>`;
            }).join('')}
            <div class="research-airspace-controls" aria-label="Research project controls">
                <button type="button" data-research-previous aria-label="Previous project">←</button>
                <span class="research-airspace-status" aria-live="polite"></span>
                <button type="button" data-research-next aria-label="Next project">→</button>
            </div>`;

        stage = container;
        records = Array.from(stage.querySelectorAll('.research-record'));
        status = stage.querySelector('.research-airspace-status');
        bindStageInteractions();
        createDetailDialog();
        updateRecords();
        openFromLocation();
    }

    function bindStageInteractions() {
        stage.querySelector('[data-research-previous]').addEventListener('click', function () {
            setActive(activeIndex - 1, { focusActive: true });
        });
        stage.querySelector('[data-research-next]').addEventListener('click', function () {
            setActive(activeIndex + 1, { focusActive: true });
        });

        records.forEach(function (record, index) {
            const cover = record.querySelector('.research-record__cover');
            cover.addEventListener('click', function () {
                if (dragMoved) return;
                if (index !== activeIndex) setActive(index, { focusActive: true });
                else openDetail(index, true);
            });
            cover.addEventListener('pointerenter', function () { setVideoState(record, true); });
            cover.addEventListener('pointerleave', function () { setVideoState(record, index === activeIndex); });
            cover.addEventListener('focus', function () { setVideoState(record, true); });
            cover.addEventListener('blur', function () { setVideoState(record, index === activeIndex); });
        });

        stage.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                setActive(activeIndex + 1, { focusActive: true });
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setActive(activeIndex - 1, { focusActive: true });
            } else if (event.key === 'Home') {
                event.preventDefault();
                setActive(0, { focusActive: true });
            } else if (event.key === 'End') {
                event.preventDefault();
                setActive(records.length - 1, { focusActive: true });
            } else if ((event.key === 'Enter' || event.key === ' ') && event.target === stage) {
                event.preventDefault();
                openDetail(activeIndex, true);
            }
        });

        stage.addEventListener('wheel', function (event) {
            const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
            if (!horizontalIntent || wheelLocked) return;
            event.preventDefault();
            wheelLocked = true;
            setActive(activeIndex + (event.deltaX + event.deltaY > 0 ? 1 : -1));
            window.setTimeout(function () { wheelLocked = false; }, motionQuery.matches ? 100 : 420);
        }, { passive: false });

        stage.addEventListener('pointerdown', function (event) {
            if (event.button !== 0) return;
            dragStartX = event.clientX;
            dragMoved = false;
            stage.setPointerCapture(event.pointerId);
        });
        stage.addEventListener('pointermove', function (event) {
            if (!stage.hasPointerCapture(event.pointerId)) return;
            if (Math.abs(event.clientX - dragStartX) > 8) dragMoved = true;
        });
        stage.addEventListener('pointerup', function (event) {
            if (!stage.hasPointerCapture(event.pointerId)) return;
            const delta = event.clientX - dragStartX;
            stage.releasePointerCapture(event.pointerId);
            if (Math.abs(delta) > 48) setActive(activeIndex + (delta < 0 ? 1 : -1));
            window.setTimeout(function () { dragMoved = false; }, 0);
        });

        let resizeFrame = 0;
        window.addEventListener('resize', function () {
            if (resizeFrame) return;
            resizeFrame = window.requestAnimationFrame(function () {
                resizeFrame = 0;
                updateRecords();
            });
        }, { passive: true });
    }

    function detailMedia(paper) {
        return `
            <div class="research-detail__media">
                <img src="${paper.img}" alt="${paper.title}">
                ${paper.video ? `<video muted loop playsinline preload="metadata" poster="${paper.img}"><source src="${paper.video}" type="video/mp4"></video>` : ''}
            </div>`;
    }

    function createDetailDialog() {
        if (document.querySelector('.research-detail')) return;
        const dialog = document.createElement('div');
        dialog.className = 'research-detail';
        dialog.id = 'research-detail';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-hidden', 'true');
        dialog.setAttribute('aria-labelledby', 'research-detail-title');
        dialog.inert = true;
        dialog.innerHTML = `
            <button type="button" class="research-detail__close" aria-label="Back to Recent Research">
                <span aria-hidden="true">←</span><span>Back</span>
            </button>
            <div class="research-detail__stage">
                <div class="research-detail__flipper">
                    <div class="research-detail__face research-detail__front" aria-hidden="true">
                        <div class="research-detail__front-card"></div>
                    </div>
                    <div class="research-detail__face research-detail__back">
                        <div class="research-detail__panel"></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog || event.target.closest('.research-detail__close')) closeDetail(true);
        });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDetail(true);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(dialog.querySelectorAll('a[href], button:not([disabled])'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    function renderDetail(index) {
        const dialog = document.querySelector('.research-detail');
        const panel = dialog.querySelector('.research-detail__panel');
        const frontCard = dialog.querySelector('.research-detail__front-card');
        const paper = papers[index];
        frontCard.innerHTML = `<img src="${paper.img}" alt="">`;
        panel.innerHTML = `
            ${detailMedia(paper)}
            <div class="research-detail__copy">
                <div class="airspace-kicker">Research record ${String(index + 1).padStart(2, '0')} / ${String(papers.length).padStart(2, '0')}</div>
                <h3 id="research-detail-title">${paper.title}</h3>
                <dl class="research-detail__facts">
                    <div><dt>Published</dt><dd>${paper.date || ''}</dd></div>
                    <div><dt>Venue</dt><dd>${paper.venue || ''}</dd></div>
                </dl>
                <section class="research-detail__section" aria-labelledby="research-detail-authors-${index + 1}">
                    <h4 id="research-detail-authors-${index + 1}">Authors</h4>
                    <div class="research-detail__authors">${processAuthors(paper.authors)}</div>
                </section>
                <section class="research-detail__section" aria-labelledby="research-detail-directions-${index + 1}">
                    <h4 id="research-detail-directions-${index + 1}">Research directions</h4>
                    <div class="research-detail__tags">${tagLinks(paper)}</div>
                </section>
                <a class="research-detail__link" href="${paper.url}" target="_blank" rel="noopener noreferrer"
                    aria-label="Open the original publication for ${paper.title}">Learn More</a>
            </div>`;
        const detailRecord = panel.closest('.research-detail');
        const video = panel.querySelector('video');
        if (video) {
            const playResult = video.play();
            if (playResult && typeof playResult.then === 'function') {
                playResult.then(function () { detailRecord.classList.add('is-video-playing'); }).catch(function () {});
            }
        }
    }

    function openDetail(index, pushHistory) {
        const dialog = document.querySelector('.research-detail');
        if (!dialog || !papers[index]) return;
        detailReturnFocus = document.activeElement;
        detailIndex = index;
        setActive(index);
        renderDetail(index);
        window.clearTimeout(detailFlipTimer);
        window.clearTimeout(detailFocusTimer);
        dialog.classList.remove('is-ready', 'is-flipped');
        dialog.inert = false;
        dialog.setAttribute('aria-hidden', 'false');
        document.body.classList.add('research-detail-open');
        records.forEach(function (record, recordIndex) {
            const cover = record.querySelector('.research-record__cover');
            if (cover) cover.setAttribute('aria-expanded', String(recordIndex === index));
            setVideoState(record, false);
        });
        window.requestAnimationFrame(function () {
            dialog.classList.add('is-ready');
            if (motionQuery.matches) {
                dialog.classList.add('is-flipped');
            } else {
                detailFlipTimer = window.setTimeout(function () {
                    dialog.classList.add('is-flipped');
                }, 140);
            }
        });
        if (pushHistory) {
            window.history.pushState({ researchDetail: index }, '', `#research-${index + 1}`);
        }
        detailFocusTimer = window.setTimeout(function () {
            const close = dialog.querySelector('.research-detail__close');
            if (close) close.focus();
        }, motionQuery.matches ? 0 : 80);
    }

    function hideDetail(restoreFocus) {
        const dialog = document.querySelector('.research-detail');
        if (!dialog || dialog.getAttribute('aria-hidden') === 'true') return;
        window.clearTimeout(detailFlipTimer);
        window.clearTimeout(detailFocusTimer);
        dialog.querySelectorAll('video').forEach(function (video) { video.pause(); });
        dialog.classList.remove('is-video-playing');
        dialog.classList.remove('is-ready', 'is-flipped');
        dialog.inert = true;
        dialog.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('research-detail-open');
        records.forEach(function (record) {
            const cover = record.querySelector('.research-record__cover');
            if (cover) cover.setAttribute('aria-expanded', 'false');
        });
        detailIndex = -1;
        updateRecords();
        if (restoreFocus && detailReturnFocus && typeof detailReturnFocus.focus === 'function') detailReturnFocus.focus();
    }

    function closeDetail(restoreFocus) {
        if (detailIndex < 0) return;
        if (window.history.state && typeof window.history.state.researchDetail === 'number') {
            window.history.back();
        } else {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            hideDetail(restoreFocus);
        }
    }

    function openFromLocation() {
        const match = window.location.hash.match(/^#research-(\d+)$/);
        if (!match) return;
        const index = Number(match[1]) - 1;
        if (papers[index]) openDetail(index, false);
    }

    window.addEventListener('popstate', function (event) {
        if (event.state && typeof event.state.researchDetail === 'number') {
            openDetail(event.state.researchDetail, false);
        } else {
            hideDetail(true);
        }
    });

    function updateYear() {
        const yearElement = document.getElementById('current-year');
        if (yearElement) yearElement.textContent = new Date().getFullYear();
    }

    function initialize() {
        if (typeof papers === 'undefined') {
            console.warn('Paper data not loaded.');
            return;
        }
        renderPapers();
        updateYear();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
