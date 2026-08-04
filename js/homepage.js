// Homepage paper storytelling. The paper data remains owned by papers-data.js.

(function () {
    'use strict';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hoverMediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    let activeIndex = 0;
    let detailIndex = -1;
    let stage = null;
    let status = null;
    let records = [];
    let dragStartX = 0;
    let dragMoved = false;
    let dragCaptureTarget = null;
    let wheelLocked = false;
    const DETAIL_STATES = Object.freeze({
        IDLE: 'IDLE',
        FOCUSED: 'FOCUSED',
        OPENING: 'OPENING',
        DETAIL_OPEN: 'DETAIL_OPEN',
        CLOSING: 'CLOSING'
    });
    let detailReturnFocus = null;
    let detailState = DETAIL_STATES.IDLE;
    let detailStartTimer = 0;
    let detailAnimationTimer = 0;
    let detailFocusTimer = 0;
    let detailOrigin = null;
    let restoreFocusAfterClose = true;

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
            : Math.min(window.innerWidth * 0.42, 760);
        const distance = Math.abs(offset);
        return {
            x: offset * step,
            y: offset === 0 ? -10 : (offset % 2 ? 32 : -26) + distance * 6,
            z: 0,
            rotate: offset * (compact ? 3.8 : 4.8),
            scale: offset === 0 ? 1 : Math.max(0.56, 0.8 - distance * 0.08),
            opacity: offset === 0 ? 1 : (distance > 2 ? 0 : Math.max(0.34, 0.82 - distance * 0.2)),
            layer: 20 - distance
        };
    }

    function videoFor(record) {
        return record ? record.querySelector('video') : null;
    }

    function setVideoState(record, shouldPlay) {
        const video = videoFor(record);
        if (!video) return;
        if (shouldPlay && !motionQuery.matches) {
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

    function passiveActiveMedia(index) {
        return !hoverMediaQuery.matches && index === activeIndex &&
            (detailState === DETAIL_STATES.IDLE || detailState === DETAIL_STATES.FOCUSED);
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
            setVideoState(record, passiveActiveMedia(index));
        });
        if (status) status.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
        if (focusActive && records[activeIndex]) records[activeIndex].querySelector('.research-record__cover').focus();
    }

    function detailLocked() {
        return detailState === DETAIL_STATES.OPENING || detailState === DETAIL_STATES.DETAIL_OPEN || detailState === DETAIL_STATES.CLOSING;
    }

    function setActive(nextIndex, options) {
        if (detailLocked() && !(options && options.force)) return;
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

    function mediaType(source) {
        if (/\.webm(?:$|\?)/i.test(source || '')) return 'video/webm';
        return 'video/mp4';
    }

    function mediaFrame(paper, context) {
        const fitMode = paper.mediaFitMode === 'cover' ? 'cover' : 'contain';
        const mediaPosition = paper.coverPosition || '50% 50%';
        const detail = context === 'detail';
        const front = context === 'front';
        const frameClass = detail ? 'research-detail__media-frame' : (front ? 'research-detail__front-media' : 'research-record__media');
        const backdrop = fitMode === 'contain'
            ? `<img class="research-media-backdrop" src="${paper.img}" alt="" aria-hidden="true" loading="lazy" decoding="async">`
            : '';
        const video = paper.video
            ? `<video class="research-media-foreground research-media-video" muted loop playsinline preload="metadata" poster="${paper.img}"${detail ? ' controls' : ''}><source src="${paper.video}" type="${mediaType(paper.video)}"></video>`
            : '';
        return `
            <div class="research-media-frame ${frameClass}" data-media-fit="${fitMode}" style="--media-position: ${mediaPosition};">
                ${backdrop}
                <img class="research-media-foreground research-media-poster" src="${paper.img}" alt="" loading="lazy" decoding="async">
                ${video}
            </div>`;
    }

    function paperMedia(paper) {
        return mediaFrame(paper, 'card');
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
                <button type="button" data-research-previous aria-label="Previous research">←</button>
                <span class="research-airspace-status" aria-live="polite"></span>
                <button type="button" data-research-next aria-label="Next research">→</button>
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
        const bindControl = function (button, delta) {
            const move = function (event) {
                event.stopPropagation();
                setActive(activeIndex + delta);
            };
            button.addEventListener('click', move);
            button.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                move(event);
            });
        };
        bindControl(stage.querySelector('[data-research-previous]'), -1);
        bindControl(stage.querySelector('[data-research-next]'), 1);

        records.forEach(function (record, index) {
            const cover = record.querySelector('.research-record__cover');
            cover.addEventListener('click', function () {
                if (dragMoved || detailLocked()) return;
                if (index !== activeIndex) setActive(index, { focusActive: true });
                else openDetail(index, true);
            });
            cover.addEventListener('pointerenter', function () {
                if (!detailLocked()) setVideoState(record, true);
            });
            cover.addEventListener('pointerleave', function () {
                setVideoState(record, !detailLocked() && passiveActiveMedia(index));
            });
            cover.addEventListener('focus', function () {
                if (detailState === DETAIL_STATES.IDLE) detailState = DETAIL_STATES.FOCUSED;
                if (!detailLocked()) setVideoState(record, true);
            });
            cover.addEventListener('blur', function () {
                if (detailState === DETAIL_STATES.FOCUSED) detailState = DETAIL_STATES.IDLE;
                setVideoState(record, !detailLocked() && passiveActiveMedia(index));
            });
        });

        stage.addEventListener('click', function (event) {
            if (event.target.closest('.research-record__cover') || dragMoved || detailLocked()) return;
            const activeCover = records[activeIndex] && records[activeIndex].querySelector('.research-record__cover');
            if (!activeCover) return;
            const rect = activeCover.getBoundingClientRect();
            const hitsVisibleCover =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;
            if (hitsVisibleCover) openDetail(activeIndex, true);
        });

        stage.addEventListener('keydown', function (event) {
            if (detailLocked()) return;
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
            if (detailLocked()) return;
            const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
            if (!horizontalIntent || wheelLocked) return;
            event.preventDefault();
            wheelLocked = true;
            setActive(activeIndex + (event.deltaX + event.deltaY > 0 ? 1 : -1));
            window.setTimeout(function () { wheelLocked = false; }, motionQuery.matches ? 100 : 420);
        }, { passive: false });

        stage.addEventListener('pointerdown', function (event) {
            if (detailLocked() || event.button !== 0) return;
            dragStartX = event.clientX;
            dragMoved = false;
            dragCaptureTarget = event.target.closest('.research-record__cover') || stage;
            dragCaptureTarget.setPointerCapture(event.pointerId);
        });
        stage.addEventListener('pointermove', function (event) {
            if (!dragCaptureTarget || !dragCaptureTarget.hasPointerCapture(event.pointerId)) return;
            if (Math.abs(event.clientX - dragStartX) > 8) dragMoved = true;
        });
        stage.addEventListener('pointerup', function (event) {
            if (!dragCaptureTarget || !dragCaptureTarget.hasPointerCapture(event.pointerId)) return;
            const delta = event.clientX - dragStartX;
            const swiped = Math.abs(delta) > 48;
            dragCaptureTarget.releasePointerCapture(event.pointerId);
            dragCaptureTarget = null;
            dragMoved = swiped;
            if (swiped) setActive(activeIndex + (delta < 0 ? 1 : -1));
            window.setTimeout(function () { dragMoved = false; }, 0);
        });
        stage.addEventListener('pointercancel', function (event) {
            if (dragCaptureTarget && dragCaptureTarget.hasPointerCapture(event.pointerId)) {
                dragCaptureTarget.releasePointerCapture(event.pointerId);
            }
            dragCaptureTarget = null;
            dragMoved = false;
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
                ${mediaFrame(paper, 'detail')}
            </div>`;
    }

    function detailLinks(paper) {
        const candidates = [
            ['Open publication', paper.paperUrl || paper.url],
            ['Open project', paper.projectUrl],
            ['Open GitHub', paper.githubUrl],
            ['Open video', paper.videoUrl]
        ];
        const seen = new Set();
        return candidates.filter(function (entry) {
            if (!entry[1] || seen.has(entry[1])) return false;
            seen.add(entry[1]);
            return true;
        }).map(function (entry) {
            return `<a class="research-detail__link" href="${entry[1]}" target="_blank" rel="noopener noreferrer">${entry[0]}</a>`;
        }).join('');
    }

    function createDetailDialog() {
        if (document.querySelector('.research-detail')) return;
        const dialog = document.createElement('div');
        dialog.className = 'research-detail';
        dialog.id = 'research-detail';
        dialog.dataset.state = DETAIL_STATES.IDLE;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-hidden', 'true');
        dialog.setAttribute('aria-labelledby', 'research-detail-title');
        dialog.setAttribute('aria-describedby', 'research-detail-description');
        dialog.inert = true;
        dialog.innerHTML = `
            <button type="button" class="research-detail__close" aria-label="Back to Recent Research">
                <span aria-hidden="true">←</span><span>Back</span>
            </button>
            <div class="research-detail__navigation" aria-label="Research project controls">
                <button type="button" data-research-detail-previous aria-label="Previous research">←</button>
                <button type="button" data-research-detail-next aria-label="Next research">→</button>
            </div>
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
            if (event.target.closest('[data-research-detail-previous]')) {
                event.stopPropagation();
                navigateFromDetail(-1);
                return;
            }
            if (event.target.closest('[data-research-detail-next]')) {
                event.stopPropagation();
                navigateFromDetail(1);
                return;
            }
            if (event.target === dialog || event.target.closest('.research-detail__close')) closeDetail(true);
        });
        dialog.addEventListener('keydown', function (event) {
            const previous = event.target.closest('[data-research-detail-previous]');
            const next = event.target.closest('[data-research-detail-next]');
            if ((previous || next) && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                event.stopPropagation();
                navigateFromDetail(previous ? -1 : 1);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDetail(true);
                return;
            }
            if (event.key !== 'Tab' || detailState === DETAIL_STATES.CLOSING) return;
            const focusable = Array.from(dialog.querySelectorAll('a[href], button:not([disabled]), video[controls]')).filter(function (element) {
                return !element.closest('[aria-hidden="true"]');
            });
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

    function setBackgroundInert(inert) {
        Array.from(document.body.children).forEach(function (element) {
            if (element.classList.contains('research-detail') || element.tagName === 'SCRIPT') return;
            if (inert) {
                if (!element.inert) {
                    element.dataset.researchDetailInert = 'true';
                    element.inert = true;
                }
            } else if (element.dataset.researchDetailInert === 'true') {
                element.inert = false;
                delete element.dataset.researchDetailInert;
            }
        });
    }

    function setDetailState(nextState) {
        detailState = nextState;
        const dialog = document.querySelector('.research-detail');
        if (dialog) dialog.dataset.state = nextState;
    }

    function captureDetailOrigin(index) {
        const record = records[index];
        const cover = record && record.querySelector('.research-record__cover');
        if (!cover) return null;
        const rect = cover.getBoundingClientRect();
        const targetWidth = window.innerWidth < 600
            ? Math.max(1, window.innerWidth - 24)
            : Math.min(window.innerWidth * 0.86, 1120);
        const targetHeight = Math.min(targetWidth / 1.6, window.innerHeight - 64);
        const fittedWidth = targetHeight * 1.6;
        return {
            index: index,
            x: rect.left + rect.width / 2 - window.innerWidth / 2,
            y: rect.top + rect.height / 2 - window.innerHeight / 2,
            scale: Math.max(0.12, Math.min(1, rect.width / Math.max(fittedWidth, 1))),
            scrollY: window.scrollY,
            transform: record.style.transform,
            zIndex: record.style.zIndex
        };
    }

    function applyDetailOrigin(dialog, origin) {
        dialog.style.setProperty('--detail-origin-x', `${origin ? origin.x : 0}px`);
        dialog.style.setProperty('--detail-origin-y', `${origin ? origin.y : 0}px`);
        dialog.style.setProperty('--detail-origin-scale', origin ? origin.scale : 0.34);
    }

    function renderDetail(index) {
        const dialog = document.querySelector('.research-detail');
        const panel = dialog.querySelector('.research-detail__panel');
        const frontCard = dialog.querySelector('.research-detail__front-card');
        const paper = papers[index];
        const yearMatch = `${paper.date || ''} ${paper.venue || ''}`.match(/\b(?:19|20)\d{2}\b/);
        frontCard.innerHTML = mediaFrame(paper, 'front');
        panel.innerHTML = `
            ${detailMedia(paper)}
            <div class="research-detail__copy" id="research-detail-description">
                <div class="airspace-kicker">Research record ${String(index + 1).padStart(2, '0')} / ${String(papers.length).padStart(2, '0')}</div>
                <h3 id="research-detail-title" tabindex="-1">${paper.title}</h3>
                <section class="research-detail__section research-detail__section--authors" aria-labelledby="research-detail-authors-${index + 1}">
                    <h4 id="research-detail-authors-${index + 1}">Authors</h4>
                    <div class="research-detail__authors">${processAuthors(paper.authors)}</div>
                </section>
                <dl class="research-detail__facts">
                    <div><dt>Year</dt><dd>${yearMatch ? yearMatch[0] : ''}</dd></div>
                    <div><dt>Published</dt><dd>${paper.date || ''}</dd></div>
                    <div><dt>Venue</dt><dd>${paper.venue || ''}</dd></div>
                </dl>
                <section class="research-detail__section" aria-labelledby="research-detail-directions-${index + 1}">
                    <h4 id="research-detail-directions-${index + 1}">Research directions</h4>
                    <div class="research-detail__tags">${tagLinks(paper)}</div>
                </section>
                <div class="research-detail__links">${detailLinks(paper)}</div>
            </div>`;
    }

    function pauseDetailMedia() {
        const dialog = document.querySelector('.research-detail');
        if (!dialog) return;
        dialog.querySelectorAll('video').forEach(function (video) {
            video.pause();
        });
        dialog.classList.remove('is-video-playing');
    }

    function playDetailMedia() {
        if (motionQuery.matches) return;
        const dialog = document.querySelector('.research-detail');
        const video = dialog && dialog.querySelector('.research-detail__back video');
        if (!video) return;
        const playResult = video.play();
        if (playResult && typeof playResult.then === 'function') {
            playResult.then(function () { dialog.classList.add('is-video-playing'); }).catch(function () {});
        }
    }

    function openDetail(index, pushHistory) {
        const dialog = document.querySelector('.research-detail');
        if (!dialog || !papers[index] || detailLocked()) return;
        window.clearTimeout(detailStartTimer);
        window.clearTimeout(detailAnimationTimer);
        window.clearTimeout(detailFocusTimer);
        detailReturnFocus = document.activeElement;
        detailOrigin = captureDetailOrigin(index);
        detailIndex = index;
        activeIndex = index;
        setDetailState(DETAIL_STATES.OPENING);
        updateRecords();
        renderDetail(index);
        applyDetailOrigin(dialog, detailOrigin);
        dialog.className = 'research-detail is-preparing';
        dialog.inert = false;
        dialog.setAttribute('aria-hidden', 'false');
        document.body.classList.add('research-detail-open');
        setBackgroundInert(true);
        records.forEach(function (record, recordIndex) {
            record.classList.toggle('is-detail-source', recordIndex === index);
            const cover = record.querySelector('.research-record__cover');
            if (cover) cover.setAttribute('aria-expanded', String(recordIndex === index));
            setVideoState(record, false);
        });
        void dialog.offsetWidth;

        if (motionQuery.matches) {
            dialog.classList.remove('is-preparing');
            dialog.classList.add('is-reduced', 'is-detail-open');
            setDetailState(DETAIL_STATES.DETAIL_OPEN);
        } else {
            detailStartTimer = window.setTimeout(function () {
                if (detailState !== DETAIL_STATES.OPENING) return;
                dialog.classList.remove('is-preparing');
                dialog.classList.add('is-opening');
            }, 32);
            detailAnimationTimer = window.setTimeout(function () {
                if (detailState !== DETAIL_STATES.OPENING) return;
                dialog.classList.remove('is-opening');
                dialog.classList.add('is-detail-open');
                setDetailState(DETAIL_STATES.DETAIL_OPEN);
                playDetailMedia();
            }, 940);
        }
        if (pushHistory && !(window.history.state && window.history.state.researchDetail === index)) {
            window.history.pushState({ researchDetail: index }, '', `#research-${index + 1}`);
        }
        detailFocusTimer = window.setTimeout(function () {
            const close = dialog.querySelector('.research-detail__close');
            if (close) close.focus();
        }, motionQuery.matches ? 0 : 90);
    }

    function finishDetailClose() {
        const dialog = document.querySelector('.research-detail');
        if (!dialog) return;
        dialog.className = 'research-detail';
        dialog.inert = true;
        dialog.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('research-detail-open');
        setBackgroundInert(false);
        records.forEach(function (record) {
            record.classList.remove('is-detail-source');
            const cover = record.querySelector('.research-record__cover');
            if (cover) cover.setAttribute('aria-expanded', 'false');
        });
        detailIndex = -1;
        detailOrigin = null;
        setDetailState(DETAIL_STATES.IDLE);
        updateRecords();
        if (restoreFocusAfterClose && detailReturnFocus && typeof detailReturnFocus.focus === 'function') detailReturnFocus.focus();
    }

    function startDetailClose(restoreFocus) {
        const dialog = document.querySelector('.research-detail');
        if (!dialog || detailState === DETAIL_STATES.IDLE || detailState === DETAIL_STATES.CLOSING) return;
        window.clearTimeout(detailStartTimer);
        window.clearTimeout(detailAnimationTimer);
        window.clearTimeout(detailFocusTimer);
        restoreFocusAfterClose = restoreFocus;
        pauseDetailMedia();
        setDetailState(DETAIL_STATES.CLOSING);
        dialog.classList.remove('is-preparing', 'is-opening', 'is-detail-open', 'is-reduced');
        dialog.classList.add('is-closing');
        detailAnimationTimer = window.setTimeout(finishDetailClose, motionQuery.matches ? 80 : 880);
    }

    function closeDetail(restoreFocus) {
        if (detailState === DETAIL_STATES.IDLE || detailState === DETAIL_STATES.CLOSING) return;
        restoreFocusAfterClose = restoreFocus;
        if (window.history.state && window.history.state.researchDetail === detailIndex) {
            window.history.back();
        } else {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            startDetailClose(restoreFocus);
        }
    }

    function navigateFromDetail(delta) {
        if (detailIndex < 0 || !records.length || detailState === DETAIL_STATES.CLOSING) return;
        const nextIndex = (detailIndex + delta + records.length) % records.length;
        restoreFocusAfterClose = false;
        if (window.history.state && window.history.state.researchDetail === detailIndex) {
            window.history.back();
        } else {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            startDetailClose(false);
        }
        window.setTimeout(function () {
            setActive(nextIndex, { focusActive: true, force: true });
        }, motionQuery.matches ? 100 : 900);
    }

    function openFromLocation() {
        const match = window.location.hash.match(/^#research-(\d+)$/);
        if (!match) return;
        const index = Number(match[1]) - 1;
        if (papers[index]) openDetail(index, false);
    }

    window.addEventListener('popstate', function (event) {
        if (event.state && typeof event.state.researchDetail === 'number') {
            if (detailState === DETAIL_STATES.IDLE) openDetail(event.state.researchDetail, false);
        } else {
            startDetailClose(restoreFocusAfterClose);
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
