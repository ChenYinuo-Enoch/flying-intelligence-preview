(function () {
    'use strict';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = () => motionQuery.matches;

    function addSharedShell() {
        const script = document.currentScript || document.querySelector('script[src*="interactive-airspace.js"]');
        if (!script) return;

        const projectRoot = new URL('../', script.src);
        const currentPath = window.location.pathname;
        const navItems = [
            { label: 'Home', path: 'index.html', active: /\/index\.html$|\/$/.test(currentPath) },
            { label: 'Publication', path: 'pages/publication.html', active: currentPath.includes('/pages/publication.html') },
            { label: 'Group', path: 'pages/group.html', active: currentPath.includes('/pages/group.html') || currentPath.includes('/person/') },
            { label: 'Resource', path: 'pages/resource.html', active: currentPath.includes('/pages/resource.html') }
        ];

        if (!document.querySelector('.site-navbar') && !document.querySelector('.airspace-compact-nav')) {
            const header = document.createElement('header');
            header.className = 'airspace-compact-nav';
            header.innerHTML = `
                <div class="airspace-compact-nav__inner">
                    <a class="airspace-compact-nav__brand" href="${new URL('index.html', projectRoot).href}" aria-label="Flying Intelligence Home">
                        <img src="${new URL('files/images/FlyingIntelligence_LOGO.png', projectRoot).href}" alt="Flying Intelligence">
                    </a>
                    <nav aria-label="Primary navigation">
                        <ul class="airspace-compact-nav__links">
                            ${navItems.map(item => `<li><a href="${new URL(item.path, projectRoot).href}"${item.active ? ' aria-current="page"' : ''}>${item.label}</a></li>`).join('')}
                        </ul>
                    </nav>
                </div>`;
            document.body.prepend(header);
        }

        if (!document.querySelector('.footer') && !document.querySelector('.airspace-dynamic-footer')) {
            const footer = document.createElement('footer');
            footer.className = 'airspace-dynamic-footer';
            footer.innerHTML = `&copy; ${new Date().getFullYear()} All rights reserved | Built upon <a href="https://colorlib.com" target="_blank" rel="noopener noreferrer">Colorlib</a>`;
            document.body.appendChild(footer);
        }
    }

    function enhanceNavigation() {
        const navbar = document.querySelector('.site-navbar');
        if (!navbar) return;

        let scheduled = false;
        const update = function () {
            navbar.classList.toggle('is-scrolled', window.scrollY > 24);
            scheduled = false;
        };
        const requestUpdate = function () {
            if (!scheduled) {
                scheduled = true;
                window.requestAnimationFrame(update);
            }
        };

        update();
        window.addEventListener('scroll', requestUpdate, { passive: true });
    }

    function addSectionIndexes() {
        const labels = [
            ['.research-direction-section .section-title', '01 / AIRSPACE RESEARCH'],
            ['.recent-achievements-section .section-title', '02 / RESEARCH LOG'],
            ['.publication-page .section-title', 'RESEARCH ARCHIVE'],
            ['.group-page .group-page-title', 'RESEARCH COMMUNITY']
        ];

        labels.forEach(function (entry) {
            const container = document.querySelector(entry[0]);
            if (!container || container.querySelector('.section-index')) return;
            const label = document.createElement('span');
            label.className = 'section-index';
            label.textContent = entry[1];
            container.prepend(label);
        });
    }

    function initializeReveal() {
        if (reducedMotion() || !('IntersectionObserver' in window)) return;

        const targets = Array.from(document.querySelectorAll([
            '.research-chart-item',
            '.paper-achievement-card',
            '.publication-entry',
            '.group-section',
            '.resource-page .trend-entry',
            '.research-page .trend-entry',
            '.direction-page .paper-card',
            '.person-page .paper-card'
        ].join(',')));

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.remove('airspace-reveal-pending');
                entry.target.classList.add('airspace-reveal-visible');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

        targets.forEach(function (target, index) {
            target.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
            target.classList.add('airspace-reveal-pending');
            observer.observe(target);
        });
    }

    class AirspaceCanvas {
        constructor(canvas) {
            this.canvas = canvas;
            this.context = canvas.getContext('2d');
            this.pointer = { x: 0.68, y: 0.38 };
            this.target = { x: 0.68, y: 0.38 };
            this.frame = 0;
            this.time = 0;
            this.visible = true;
            this.resizeObserver = null;

            this.resize = this.resize.bind(this);
            this.render = this.render.bind(this);
            this.handlePointer = this.handlePointer.bind(this);
            this.handleVisibility = this.handleVisibility.bind(this);
            this.initialize();
        }

        initialize() {
            this.resize();
            if ('ResizeObserver' in window) {
                this.resizeObserver = new ResizeObserver(this.resize);
                this.resizeObserver.observe(this.canvas.parentElement);
            } else {
                window.addEventListener('resize', this.resize, { passive: true });
            }
            this.canvas.parentElement.addEventListener('pointermove', this.handlePointer, { passive: true });
            document.addEventListener('visibilitychange', this.handleVisibility);
            this.render();
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
            this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
            this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
            this.width = rect.width;
            this.height = rect.height;
        }

        handlePointer(event) {
            const rect = this.canvas.getBoundingClientRect();
            this.target.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            this.target.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        }

        handleVisibility() {
            this.visible = !document.hidden;
            if (this.visible && !this.frame) this.render();
        }

        drawGrid(ctx) {
            const spacing = this.width < 768 ? 72 : 92;
            ctx.save();
            ctx.strokeStyle = 'rgba(104, 194, 207, 0.07)';
            ctx.lineWidth = 1;
            for (let x = -spacing; x < this.width + spacing; x += spacing) {
                ctx.beginPath();
                ctx.moveTo(x + this.pointer.x * 10, 0);
                ctx.lineTo(x - 40 + this.pointer.x * 10, this.height);
                ctx.stroke();
            }
            for (let y = 0; y < this.height + spacing; y += spacing) {
                ctx.beginPath();
                ctx.moveTo(0, y + this.pointer.y * 8);
                ctx.lineTo(this.width, y + this.pointer.y * 8);
                ctx.stroke();
            }
            ctx.restore();
        }

        drawRoute(ctx) {
            const start = { x: this.width * 0.06, y: this.height * 0.72 };
            const control = { x: this.width * (0.42 + (this.pointer.x - 0.5) * 0.12), y: this.height * (0.18 + this.pointer.y * 0.12) };
            const end = { x: this.width * 0.92, y: this.height * 0.44 };
            ctx.save();
            ctx.setLineDash([7, 11]);
            ctx.lineDashOffset = reducedMotion() ? 0 : -this.time * 0.035;
            ctx.strokeStyle = 'rgba(255, 107, 44, 0.55)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
            ctx.stroke();
            ctx.setLineDash([]);

            const nodes = this.width < 768 ? 4 : 7;
            for (let index = 0; index < nodes; index += 1) {
                const progress = (index + 1) / (nodes + 1);
                const inverse = 1 - progress;
                const x = inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x;
                const y = inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y;
                ctx.beginPath();
                ctx.fillStyle = index % 2 ? 'rgba(155, 207, 75, 0.9)' : 'rgba(29, 166, 187, 0.9)';
                ctx.arc(x, y, index === nodes - 1 ? 4 : 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        drawRadar(ctx) {
            const x = this.width * (0.78 + (this.pointer.x - 0.5) * 0.035);
            const y = this.height * (0.48 + (this.pointer.y - 0.5) * 0.035);
            const radius = Math.min(this.width, this.height) * 0.22;
            ctx.save();
            ctx.strokeStyle = 'rgba(155, 207, 75, 0.12)';
            ctx.lineWidth = 1;
            [0.35, 0.68, 1].forEach(function (scale) {
                ctx.beginPath();
                ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.beginPath();
            ctx.moveTo(x - radius, y);
            ctx.lineTo(x + radius, y);
            ctx.moveTo(x, y - radius);
            ctx.lineTo(x, y + radius);
            ctx.stroke();
            ctx.restore();
        }

        render(timestamp) {
            this.frame = 0;
            if (!this.visible || !this.context) return;
            this.time = timestamp || 0;
            this.pointer.x += (this.target.x - this.pointer.x) * 0.055;
            this.pointer.y += (this.target.y - this.pointer.y) * 0.055;
            this.context.clearRect(0, 0, this.width, this.height);
            this.drawGrid(this.context);
            this.drawRadar(this.context);
            this.drawRoute(this.context);
            if (!reducedMotion()) this.frame = window.requestAnimationFrame(this.render);
        }
    }

    function initializeHero() {
        const hero = document.querySelector('.community-intro-section');
        if (!hero) return;

        const canvas = hero.querySelector('.airspace-canvas');
        if (canvas && canvas.getContext) new AirspaceCanvas(canvas);
        if (!pointerQuery.matches || reducedMotion()) return;

        const layers = Array.from(hero.querySelectorAll('[data-depth]'));
        const drone = hero.querySelector('.airspace-flight-object');
        let pointer = { x: 0, y: 0 };
        let frame = 0;

        const render = function () {
            layers.forEach(function (layer) {
                const depth = Number(layer.dataset.depth || 0);
                layer.style.setProperty('--parallax-x', `${pointer.x * depth}px`);
                layer.style.setProperty('--parallax-y', `${pointer.y * depth}px`);
            });
            if (drone) {
                drone.style.setProperty('--drone-rx', `${pointer.y * -4}deg`);
                drone.style.setProperty('--drone-ry', `${pointer.x * 4}deg`);
            }
            frame = 0;
        };

        hero.addEventListener('pointermove', function (event) {
            const rect = hero.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
            pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
            if (!frame) frame = window.requestAnimationFrame(render);
        }, { passive: true });

        hero.addEventListener('pointerleave', function () {
            pointer = { x: 0, y: 0 };
            if (!frame) frame = window.requestAnimationFrame(render);
        });
    }

    function initializeDirectionTrack() {
        const track = document.querySelector('.research-charts-grid');
        if (!track) return;

        track.setAttribute('tabindex', '0');
        track.setAttribute('aria-label', 'Research directions');
        track.dataset.cursor = 'DRAG';

        Array.from(track.querySelectorAll('.research-chart-item')).forEach(function (card, index) {
            if (!card.querySelector('.direction-sequence')) {
                const sequence = document.createElement('span');
                sequence.className = 'direction-sequence';
                sequence.setAttribute('aria-hidden', 'true');
                sequence.textContent = `${String(index + 1).padStart(2, '0')} / ${String(track.children.length).padStart(2, '0')}`;
                card.prepend(sequence);
            }
        });

        if (!track.previousElementSibling || !track.previousElementSibling.classList.contains('research-track-controls')) {
            const controls = document.createElement('div');
            controls.className = 'research-track-controls';
            controls.innerHTML = `
                <button class="research-track-control" type="button" data-track-direction="previous" aria-label="Previous research direction">&larr;</button>
                <button class="research-track-control" type="button" data-track-direction="next" aria-label="Next research direction">&rarr;</button>`;
            track.before(controls);
            controls.addEventListener('click', function (event) {
                const button = event.target.closest('[data-track-direction]');
                if (!button) return;
                const amount = Math.max(280, track.clientWidth * 0.68);
                track.scrollBy({ left: button.dataset.trackDirection === 'next' ? amount : -amount, behavior: reducedMotion() ? 'auto' : 'smooth' });
            });
        }

        track.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const amount = Math.max(280, track.clientWidth * 0.68);
            track.scrollBy({ left: event.key === 'ArrowRight' ? amount : -amount, behavior: reducedMotion() ? 'auto' : 'smooth' });
        });

        if (!pointerQuery.matches) return;
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startScroll = 0;

        track.addEventListener('pointerdown', function (event) {
            if (event.target.closest('a, button')) return;
            dragging = true;
            moved = false;
            startX = event.clientX;
            startScroll = track.scrollLeft;
            track.setPointerCapture(event.pointerId);
        });
        track.addEventListener('pointermove', function (event) {
            if (!dragging) return;
            const distance = event.clientX - startX;
            if (Math.abs(distance) > 4) moved = true;
            track.scrollLeft = startScroll - distance;
        });
        const release = function (event) {
            if (!dragging) return;
            dragging = false;
            if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
        };
        track.addEventListener('pointerup', release);
        track.addEventListener('pointercancel', release);
        track.addEventListener('click', function (event) {
            if (!moved) return;
            event.preventDefault();
            event.stopPropagation();
            moved = false;
        }, true);
    }

    function initializeCardTilt() {
        if (!pointerQuery.matches || reducedMotion()) return;
        document.querySelectorAll('.group-page .member-card .card').forEach(function (card) {
            let frame = 0;
            let point = { x: 0, y: 0 };
            const render = function () {
                card.style.setProperty('--tilt-x', `${point.y * -4}deg`);
                card.style.setProperty('--tilt-y', `${point.x * 4}deg`);
                frame = 0;
            };
            card.addEventListener('pointermove', function (event) {
                const rect = card.getBoundingClientRect();
                point.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
                point.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
                if (!frame) frame = window.requestAnimationFrame(render);
            });
            card.addEventListener('pointerleave', function () {
                point = { x: 0, y: 0 };
                if (!frame) frame = window.requestAnimationFrame(render);
            });
        });
    }

    function initializeCursor() {
        if (!pointerQuery.matches || reducedMotion()) return;
        const dot = document.createElement('div');
        const label = document.createElement('div');
        dot.className = 'airspace-cursor';
        label.className = 'airspace-cursor-label';
        label.setAttribute('aria-hidden', 'true');
        document.body.append(dot, label);
        document.body.classList.add('airspace-cursor-enabled');

        let frame = 0;
        let position = { x: -100, y: -100 };
        const render = function () {
            const transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
            dot.style.transform = transform;
            label.style.transform = transform;
            frame = 0;
        };
        document.addEventListener('pointermove', function (event) {
            position = { x: event.clientX, y: event.clientY };
            dot.classList.add('is-visible');
            if (!frame) frame = window.requestAnimationFrame(render);
        }, { passive: true });
        document.addEventListener('pointerover', function (event) {
            const labelled = event.target.closest('[data-cursor]');
            const interactive = event.target.closest('a, button');
            const image = event.target.closest('img, video');
            const text = event.target.closest('p, h1, h2, h3, h4, h5, h6, input, textarea, select');
            const mode = labelled ? labelled.dataset.cursor : (interactive ? 'OPEN' : (image ? 'VIEW' : ''));
            dot.classList.toggle('is-active', Boolean(interactive || labelled || image));
            label.textContent = mode;
            label.classList.toggle('is-visible', Boolean(mode) && !text);
        });
        document.addEventListener('pointerleave', function () {
            dot.classList.remove('is-visible', 'is-active');
            label.classList.remove('is-visible');
        });
    }

    function initializeMedia() {
        document.querySelectorAll('a[target="_blank"]').forEach(function (link) {
            const values = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
            values.add('noopener');
            values.add('noreferrer');
            link.setAttribute('rel', Array.from(values).join(' '));
        });

        document.querySelectorAll('img').forEach(function (image) {
            if (!image.closest('.community-intro-section') && !image.closest('.site-navbar') && !image.closest('.header-top')) {
                image.loading = 'lazy';
            }
            image.decoding = 'async';
            if (!image.closest('a') && !image.closest('.community-intro-section')) image.dataset.cursor = 'VIEW';
        });

        document.querySelectorAll('video').forEach(function (video) {
            video.preload = 'metadata';
            video.playsInline = true;
            video.dataset.cursor = 'VIEW';
        });

        document.querySelectorAll('.paper-achievement-card, .publication-entry').forEach(function (card) {
            card.dataset.cursor = 'OPEN';
        });
    }

    function initializePageTransition() {
        if (reducedMotion()) return;
        const overlay = document.createElement('div');
        overlay.className = 'airspace-transition';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = '<span class="airspace-transition__line"></span>';
        document.body.appendChild(overlay);

        window.addEventListener('pageshow', function () {
            overlay.classList.remove('is-active');
        });

        document.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target.closest('a[href]');
            if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
            const rawHref = link.getAttribute('href');
            if (!rawHref || rawHref === '#' || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('javascript:')) return;

            const destination = new URL(link.href, window.location.href);
            if (destination.origin !== window.location.origin) return;
            if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return;

            event.preventDefault();
            overlay.classList.add('is-active');
            window.setTimeout(function () {
                window.location.assign(destination.href);
            }, 620);
        }, true);
    }

    function initialize() {
        document.documentElement.classList.add('airspace-js');
        addSharedShell();
        enhanceNavigation();
        addSectionIndexes();
        initializeHero();
        initializeDirectionTrack();
        initializeCardTilt();
        initializeMedia();
        initializeReveal();
        initializeCursor();
        initializePageTransition();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
