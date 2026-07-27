(function () {
    'use strict';

    const script = document.currentScript || document.querySelector('script[src*="interactive-final.js"]');
    const projectRoot = script ? new URL('../', script.src) : new URL('./', window.location.href);
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = window.matchMedia('(max-width: 767px)');

    let sceneController = null;
    let sceneRequest = null;

    function pageTheme() {
        const body = document.body;
        if (body.classList.contains('home-page')) return 'home';
        if (body.classList.contains('publication-page')) return 'publication';
        if (body.classList.contains('group-page')) return 'group';
        if (body.classList.contains('resource-page')) return 'resource';
        if (body.classList.contains('person-page')) return 'profile';
        if (body.classList.contains('research-page')) return 'research';
        if (body.classList.contains('direction-page')) return 'direction';
        return 'default';
    }

    function setStaticBackground(reason) {
        document.documentElement.classList.add('three-static-fallback');
        document.documentElement.dataset.threeState = reason || 'static';
    }

    function supportsWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return Boolean(window.WebGLRenderingContext && (
                canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
                canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
            ));
        } catch (_error) {
            return false;
        }
    }

    function shouldUseStaticScene() {
        const params = new URLSearchParams(window.location.search);
        return params.get('static-airspace') === '1' || motionQuery.matches || mobileQuery.matches || !supportsWebGL();
    }

    function disposeScene(reason) {
        if (sceneController && typeof sceneController.dispose === 'function') {
            sceneController.dispose();
        }
        sceneController = null;
        sceneRequest = null;
        setStaticBackground(reason || 'disposed');
    }

    async function initializeThreeScene() {
        if (sceneController || sceneRequest) return;
        if (shouldUseStaticScene()) {
            const staticRequested = new URLSearchParams(window.location.search).get('static-airspace') === '1';
            setStaticBackground(staticRequested ? 'requested-static' : (motionQuery.matches ? 'reduced-motion' : (mobileQuery.matches ? 'mobile-static' : 'unsupported')));
            return;
        }

        document.documentElement.classList.remove('three-static-fallback');
        document.documentElement.dataset.threeState = 'loading';
        const moduleUrl = new URL('js/three/scene-manager.js', projectRoot).href;
        sceneRequest = import(moduleUrl);

        try {
            const module = await sceneRequest;
            sceneController = module.createAirspaceScene({ theme: pageTheme() });
            document.documentElement.dataset.threeState = sceneController ? 'active' : 'static';
            if (!sceneController) setStaticBackground('initialization-declined');
        } catch (error) {
            console.warn('Interactive airspace background unavailable; static background enabled.', error && error.message ? error.message : error);
            setStaticBackground('load-failed');
        } finally {
            sceneRequest = null;
        }
    }

    function initializeGroupNavigation() {
        const navigation = document.querySelector('.group-year-navigation');
        if (!navigation) return;

        const links = Array.from(navigation.querySelectorAll('a[href^="#"]'));
        const targets = links.map(function (link) {
            const heading = document.querySelector(link.getAttribute('href'));
            return heading ? { link: link, section: heading.closest('.group-section') || heading } : null;
        }).filter(Boolean);
        if (!targets.length) return;

        function activate(link) {
            links.forEach(function (item) {
                if (item === link) item.setAttribute('aria-current', 'location');
                else item.removeAttribute('aria-current');
            });
        }

        links.forEach(function (link) {
            link.addEventListener('click', function () { activate(link); });
        });

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                const visible = entries.filter(function (entry) { return entry.isIntersecting; })
                    .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
                if (!visible.length) return;
                const current = targets.find(function (item) { return item.section === visible[0].target; });
                if (current) activate(current.link);
            }, { rootMargin: '-20% 0px -55% 0px', threshold: [0.05, 0.25, 0.5] });
            targets.forEach(function (item) { observer.observe(item.section); });
        }

        const hashLink = links.find(function (link) { return link.getAttribute('href') === window.location.hash; });
        activate(hashLink || links[0]);
    }

    function initializeResearchRecords() {
        const records = Array.from(document.querySelectorAll('.research-record'));
        if (!records.length) return;

        function setFlipped(record, flipped, restoreFocus) {
            const control = record.querySelector('.record-flip-control');
            const front = record.querySelector('.record-front');
            const back = record.querySelector('.record-back');
            record.classList.toggle('is-flipped', flipped);
            if (control) control.setAttribute('aria-expanded', String(flipped));
            if (front) {
                front.setAttribute('aria-hidden', String(flipped));
                front.inert = flipped;
            }
            if (back) {
                back.setAttribute('aria-hidden', String(!flipped));
                back.inert = !flipped;
            }
            if (flipped && back) {
                const close = back.querySelector('.record-close');
                if (close) window.setTimeout(function () { close.focus(); }, motionQuery.matches ? 0 : 220);
            }
            if (!flipped && restoreFocus && control) control.focus();
        }

        records.forEach(function (record) {
            const control = record.querySelector('.record-flip-control');
            const close = record.querySelector('.record-close');
            if (control) {
                control.dataset.cursor = 'OPEN';
                control.addEventListener('click', function () { setFlipped(record, true, false); });
            }
            if (close) {
                close.addEventListener('click', function () { setFlipped(record, false, true); });
            }
            setFlipped(record, false, false);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            const openRecords = records.filter(function (record) { return record.classList.contains('is-flipped'); });
            openRecords.forEach(function (record, index) { setFlipped(record, false, index === 0); });
        });

        document.addEventListener('click', function (event) {
            const demoButton = event.target.closest('[data-record-demo]');
            if (!demoButton) return;
            const demoId = demoButton.getAttribute('data-record-demo');
            if (typeof window.toggleDemo === 'function') window.toggleDemo(demoId, demoButton);
        });
    }

    function initializeMobileMenu() {
        const panel = document.querySelector('.site-mobile-menu');
        const opener = Array.from(document.querySelectorAll('.site-menu-toggle')).find(function (toggle) {
            return !toggle.closest('.site-mobile-menu');
        });
        const closer = panel ? panel.querySelector('.site-mobile-menu-close .js-menu-toggle') : null;
        if (!opener || !panel || !closer) return;

        if (!panel.id) panel.id = 'site-mobile-navigation';
        opener.setAttribute('aria-controls', panel.id);

        function setOpen(open, restoreFocus) {
            document.body.classList.toggle('offcanvas-menu', open);
            opener.classList.toggle('active', open);
            opener.setAttribute('aria-expanded', String(open));
            panel.setAttribute('aria-hidden', String(!open));
            if (open) window.setTimeout(function () { closer.focus(); }, motionQuery.matches ? 0 : 220);
            else if (restoreFocus) opener.focus();
        }

        opener.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            setOpen(!document.body.classList.contains('offcanvas-menu'), false);
        }, true);

        closer.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            setOpen(false, true);
        }, true);

        document.addEventListener('keydown', function (event) {
            if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.site-mobile-menu-close .js-menu-toggle')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                setOpen(false, true);
            } else if (event.key === 'Escape' && document.body.classList.contains('offcanvas-menu')) {
                event.preventDefault();
                setOpen(false, true);
            }
        }, true);

        panel.addEventListener('click', function (event) {
            if (event.target.closest('.site-mobile-menu-body a')) setOpen(false, false);
        });

        setOpen(false, false);
    }

    function initialize() {
        document.documentElement.classList.add('interactive-final-ready');
        document.body.dataset.pageTheme = pageTheme();
        initializeMobileMenu();
        initializeGroupNavigation();
        initializeResearchRecords();
        initializeThreeScene();

        const handleMotionChange = function () {
            if (shouldUseStaticScene()) disposeScene(motionQuery.matches ? 'reduced-motion' : 'mobile-static');
            else initializeThreeScene();
        };
        if (typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', handleMotionChange);
        if (typeof mobileQuery.addEventListener === 'function') mobileQuery.addEventListener('change', handleMotionChange);

        window.addEventListener('pagehide', function () {
            if (sceneController && typeof sceneController.dispose === 'function') sceneController.dispose();
            sceneController = null;
        }, { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
