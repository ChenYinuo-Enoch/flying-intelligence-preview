(function () {
    'use strict';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const bootstrapScript = document.currentScript || document.querySelector('script[src*="immersive-round3.js"]');
    const projectRoot = bootstrapScript ? new URL('../', bootstrapScript.src) : new URL('./', window.location.href);
    let menuReturnFocus = null;
    let pointerFrame = 0;
    let lastPointerEvent = null;

    function pathFor(relativePath) {
        return new URL(relativePath, projectRoot).href;
    }

    function currentPage() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/pages/publication.html')) return 'publication';
        if (path.includes('/pages/group.html') || path.includes('/person/')) return 'group';
        if (path.includes('/pages/resource.html')) return 'resource';
        if (path.includes('/pages/research.html')) return 'research';
        if (path.includes('/pages/direction_papers.html')) return 'direction';
        return 'home';
    }

    function buildNavigation() {
        if (document.querySelector('.airspace-floating-nav')) return;

        const items = [
            { key: 'home', number: '01', label: 'Home', path: 'index.html' },
            { key: 'publication', number: '02', label: 'Publication', path: 'pages/publication.html' },
            { key: 'group', number: '03', label: 'Group', path: 'pages/group.html' },
            { key: 'resource', number: '04', label: 'Resource', path: 'pages/resource.html' }
        ];
        const activePage = currentPage();
        const activeKey = activePage === 'research' || activePage === 'direction' ? 'publication' : activePage;

        const header = document.createElement('header');
        header.className = 'airspace-floating-nav';
        header.innerHTML = `
            <button class="airspace-menu-trigger" type="button" aria-controls="airspace-full-menu" aria-expanded="false">
                <span class="airspace-menu-trigger__icon" aria-hidden="true"><i></i><i></i></span>
                <span>Menu</span>
            </button>
            <div class="airspace-nav-cluster">
                <a class="airspace-brand" href="${pathFor('index.html')}" aria-label="Flying Intelligence Home">
                    <img src="${pathFor('files/images/FlyingIntelligence_LOGO.png')}" alt="">
                </a>
                <nav class="airspace-quick-links" aria-label="Quick navigation">
                    ${items.slice(1).map(function (item) {
                        const current = item.key === activeKey ? ' aria-current="page"' : '';
                        return `<a class="airspace-quick-link" href="${pathFor(item.path)}"${current}>${item.label}</a>`;
                    }).join('')}
                </nav>
            </div>`;

        const menu = document.createElement('div');
        menu.className = 'airspace-full-menu';
        menu.id = 'airspace-full-menu';
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-modal', 'true');
        menu.setAttribute('aria-label', 'Primary navigation');
        menu.setAttribute('aria-hidden', 'true');
        menu.innerHTML = `
            <button class="airspace-full-menu__close" type="button" aria-label="Close menu">
                <span aria-hidden="true">×</span>
            </button>
            <nav>
                <div class="airspace-full-menu__eyebrow">Flying Intelligence / Airspace Navigation</div>
                <ol class="airspace-full-menu__links">
                    ${items.map(function (item) {
                        const current = item.key === activeKey ? ' aria-current="page"' : '';
                        return `<li><a href="${pathFor(item.path)}"${current}><small>${item.number}</small>${item.label}</a></li>`;
                    }).join('')}
                </ol>
            </nav>`;

        document.body.prepend(menu);
        document.body.prepend(header);

        const trigger = header.querySelector('.airspace-menu-trigger');
        const close = menu.querySelector('.airspace-full-menu__close');

        function focusableElements() {
            return Array.from(menu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        }

        function setOpen(open, restoreFocus) {
            trigger.setAttribute('aria-expanded', String(open));
            menu.setAttribute('aria-hidden', String(!open));
            document.body.classList.toggle('airspace-menu-open', open);
            if (open) {
                menuReturnFocus = document.activeElement;
                window.setTimeout(function () { close.focus(); }, motionQuery.matches ? 0 : 180);
            } else if (restoreFocus && menuReturnFocus && typeof menuReturnFocus.focus === 'function') {
                menuReturnFocus.focus();
            }
        }

        trigger.addEventListener('click', function () { setOpen(true, false); });
        close.addEventListener('click', function () { setOpen(false, true); });
        menu.addEventListener('click', function (event) {
            if (event.target === menu) setOpen(false, true);
            if (event.target.closest('a[href]')) setOpen(false, false);
        });
        menu.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false, true);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = focusableElements();
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

        document.querySelectorAll('.site-wrap, .airspace-compact-nav').forEach(function (legacyShell) {
            legacyShell.remove();
        });
    }

    function wrapMotionText(element) {
        if (!element || element.dataset.motionLetters === 'ready') return;
        const accessibleLabel = element.textContent.trim().replace(/\s+/g, ' ');
        if (accessibleLabel && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-hidden')) element.setAttribute('aria-label', accessibleLabel);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
        }
        let letterIndex = 0;
        nodes.forEach(function (node) {
            const fragment = document.createDocumentFragment();
            node.nodeValue.split(/(\s+)/).forEach(function (part) {
                if (!part) return;
                if (/^\s+$/.test(part)) {
                    fragment.appendChild(document.createTextNode(part));
                    return;
                }
                const word = document.createElement('span');
                word.className = 'motion-word';
                Array.from(part).forEach(function (character) {
                    const span = document.createElement('span');
                    span.className = 'motion-letter';
                    span.setAttribute('aria-hidden', 'true');
                    span.style.setProperty('--letter-index', letterIndex);
                    span.textContent = character;
                    word.appendChild(span);
                    letterIndex += 1;
                });
                fragment.appendChild(word);
            });
            node.replaceWith(fragment);
        });
        element.classList.add('motion-text');
        element.dataset.motionLetters = 'ready';
    }

    function registerMotionText(selector, tier, strength) {
        document.querySelectorAll(selector).forEach(function (element) {
            wrapMotionText(element);
            element.classList.add(`motion-text--${tier}`);
            element.dataset.motionStrength = strength;
        });
    }

    function initializeMotionTypography() {
        const wordmark = document.querySelector('.community-intro-title');
        if (wordmark) {
            const label = wordmark.textContent.trim().replace(/\s+/g, ' ');
            wordmark.classList.add('interactive-wordmark');
            wordmark.setAttribute('aria-label', label);
            Array.from(wordmark.children).forEach(function (line) {
                line.setAttribute('aria-hidden', 'true');
                wrapMotionText(line);
                line.classList.add('motion-text--wordmark');
                line.dataset.motionStrength = '1.15';
            });
        }
        registerMotionText([
            '.publication-page .site-section > .container > .section-title h2',
            '.resource-page .site-section > .container > .row:first-child .section-title h2',
            '.direction-page #direction-title',
            '.person-page .site-section > .container > .section-title h2',
            '.group-page-title h2'
        ].join(','), 'page', '0.82');
        registerMotionText([
            '.section-title h2',
            '.research-chart-item-title',
            '.group-section-heading'
        ].join(','), 'section', '0.62');
        registerMotionText([
            '.airspace-menu-trigger > span:last-child',
            '.airspace-quick-links a',
            '.airspace-full-menu__links a',
            '.airspace-scroll-cue span',
            '.group-year-navigation a',
            '.publication-filter label'
        ].join(','), 'control', '0.48');
    }

    function resetMotionText(element) {
        if (!element) return;
        element.querySelectorAll('.motion-letter').forEach(function (letter) {
            letter.style.transform = '';
        });
    }

    function updatePointerEffects() {
        pointerFrame = 0;
        const event = lastPointerEvent;
        if (!event || motionQuery.matches || !finePointerQuery.matches) return;

        const motionElement = event.target.closest('.motion-text');
        document.querySelectorAll('.motion-text.is-pointer-active').forEach(function (active) {
            if (active !== motionElement) {
                active.classList.remove('is-pointer-active');
                resetMotionText(active);
            }
        });
        if (motionElement) {
            motionElement.classList.add('is-pointer-active');
            const strength = Number(motionElement.dataset.motionStrength || 1);
            const radius = motionElement.classList.contains('motion-text--wordmark') ? 180 : 112;
            motionElement.querySelectorAll('.motion-letter').forEach(function (letter) {
                const rect = letter.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const deltaX = centerX - event.clientX;
                const deltaY = centerY - event.clientY;
                const distance = Math.max(1, Math.hypot(deltaX, deltaY));
                const proximity = Math.max(0, 1 - distance / radius);
                if (!proximity) {
                    letter.style.transform = '';
                    return;
                }
                const x = deltaX / distance * 4.8 * strength * proximity;
                const y = (-4.4 + deltaY / distance * 1.3) * strength * proximity;
                const rotation = deltaX / distance * 3.2 * strength * proximity;
                const scale = 1 + 0.035 * strength * proximity;
                letter.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
            });
        }

        const repelTargets = document.querySelectorAll([
            '.immersive-cloud',
            '.immersive-flight-object',
            '.community-intro-content',
            '.research-chart-item',
            '.group-page .member-card',
            '.publication-entry',
            '.resource-page .trend-entry',
            '.research-page .trend-entry',
            '.direction-page .paper-card',
            '.person-page .paper-card'
        ].join(','));
        repelTargets.forEach(function (target, index) {
            const rect = target.getBoundingClientRect();
            if (rect.bottom < -80 || rect.top > window.innerHeight + 80) return;
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deltaX = centerX - event.clientX;
            const deltaY = centerY - event.clientY;
            const distance = Math.hypot(deltaX, deltaY);
            const radius = Math.min(240, Math.max(130, Math.min(rect.width, rect.height) * 0.72 + 100));
            if (distance >= radius || distance === 0) {
                target.style.removeProperty('--repel-x');
                target.style.removeProperty('--repel-y');
                target.style.removeProperty('--repel-r');
                return;
            }
            const strength = Number(target.dataset.repelStrength || 1);
            const force = (1 - distance / radius) * 11 * strength;
            const x = deltaX / distance * force;
            const y = deltaY / distance * force;
            const rotation = Math.max(-3, Math.min(3, x * 0.16 + (index % 2 ? -0.35 : 0.35)));
            target.style.setProperty('--repel-x', `${x.toFixed(2)}px`);
            target.style.setProperty('--repel-y', `${y.toFixed(2)}px`);
            target.style.setProperty('--repel-r', `${rotation.toFixed(2)}deg`);
        });
    }

    function initializePointerEffects() {
        if (!finePointerQuery.matches || motionQuery.matches) return;
        document.addEventListener('pointermove', function (event) {
            lastPointerEvent = event;
            if (!pointerFrame) pointerFrame = window.requestAnimationFrame(updatePointerEffects);
        }, { passive: true });
        document.addEventListener('pointerleave', function () {
            document.querySelectorAll('.motion-text').forEach(resetMotionText);
            document.querySelectorAll('[style*="--repel-"]').forEach(function (target) {
                target.style.removeProperty('--repel-x');
                target.style.removeProperty('--repel-y');
                target.style.removeProperty('--repel-r');
            });
        });
    }

    function initializeClickRipple() {
        if (motionQuery.matches) return;
        document.addEventListener('pointerdown', function (event) {
            if (event.pointerType === 'touch' || event.button !== 0) return;
            const ripple = document.createElement('span');
            ripple.className = 'airspace-click-ripple';
            ripple.setAttribute('aria-hidden', 'true');
            ripple.style.left = `${event.clientX}px`;
            ripple.style.top = `${event.clientY}px`;
            document.body.appendChild(ripple);
            window.requestAnimationFrame(function () { ripple.classList.add('is-active'); });
            window.setTimeout(function () { ripple.remove(); }, 680);
        }, { passive: true });
    }

    function improveMediaLoading() {
        document.querySelectorAll('img').forEach(function (image) {
            if (!image.closest('.immersive-airspace-hero, .airspace-floating-nav') && !image.hasAttribute('loading')) {
                image.loading = 'lazy';
            }
            if (!image.hasAttribute('decoding')) image.decoding = 'async';
        });
    }

    function initialize() {
        document.documentElement.classList.add('immersive-round3-ready');
        buildNavigation();
        initializeMotionTypography();
        initializePointerEffects();
        initializeClickRipple();
        improveMediaLoading();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
