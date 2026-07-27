import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.min.js';

const THEME_COLORS = {
    home: { primary: 0x3e6f9c, accent: 0xdf6f3f, secondary: 0x5b8979 },
    publication: { primary: 0x3e6f9c, accent: 0xd9a441, secondary: 0x76838c },
    group: { primary: 0x5b8979, accent: 0xdf6f3f, secondary: 0x3e6f9c },
    resource: { primary: 0x3e6f9c, accent: 0x5b8979, secondary: 0xd9a441 },
    profile: { primary: 0x5b8979, accent: 0x3e6f9c, secondary: 0x76838c },
    research: { primary: 0x3e6f9c, accent: 0xdf6f3f, secondary: 0x5b8979 },
    direction: { primary: 0x3e6f9c, accent: 0xd9a441, secondary: 0x5b8979 },
    default: { primary: 0x3e6f9c, accent: 0xdf6f3f, secondary: 0x5b8979 }
};

function seededRandom(seedText) {
    let seed = Array.from(seedText).reduce((value, character) => value + character.charCodeAt(0), 2166136261) >>> 0;
    return function random() {
        seed += 0x6d2b79f5;
        let value = seed;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function disposeMaterial(material) {
    if (!material) return;
    Object.keys(material).forEach((key) => {
        const value = material[key];
        if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
    });
    material.dispose();
}

class AirspaceScene {
    constructor(theme) {
        this.theme = THEME_COLORS[theme] ? theme : 'default';
        this.colors = THEME_COLORS[this.theme];
        this.random = seededRandom(this.theme);
        this.pointer = new THREE.Vector2(0, 0);
        this.pointerTarget = new THREE.Vector2(0, 0);
        this.clock = new THREE.Clock();
        this.animationFrame = 0;
        this.paused = false;
        this.disposed = false;

        this.handlePointer = this.handlePointer.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handleVisibility = this.handleVisibility.bind(this);
        this.render = this.render.bind(this);

        this.initialize();
    }

    initialize() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = `three-airspace-background three-airspace-background--${this.theme}`;
        this.canvas.setAttribute('aria-hidden', 'true');
        document.body.prepend(this.canvas);

        const reducedHardware = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: !reducedHardware,
            powerPreference: reducedHardware ? 'low-power' : 'high-performance'
        });
        this.renderer.setClearColor(0xf6f4ed, 0);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedHardware ? 1 : 1.5));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xf6f4ed, 0.055);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
        this.camera.position.set(0, 1.2, 9.2);
        this.camera.lookAt(0, 0, 0);

        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.createLighting();
        this.createGrid();
        this.createAirspacePoints(reducedHardware ? 42 : 76);
        this.createNetwork(reducedHardware ? 9 : 14);
        this.createThemeObjects();
        this.handleResize();

        window.addEventListener('resize', this.handleResize, { passive: true });
        window.addEventListener('pointermove', this.handlePointer, { passive: true });
        document.addEventListener('visibilitychange', this.handleVisibility);
        document.documentElement.classList.add('three-airspace-active');
        this.render();
    }

    createLighting() {
        const ambient = new THREE.HemisphereLight(0xffffff, 0xdde7e3, 2.4);
        this.scene.add(ambient);
        const key = new THREE.DirectionalLight(0xfff0de, 2.2);
        key.position.set(4, 6, 7);
        this.scene.add(key);
    }

    createGrid() {
        const grid = new THREE.GridHelper(22, 22, this.colors.primary, this.colors.secondary);
        grid.position.set(0, -2.45, -0.8);
        grid.material.transparent = true;
        grid.material.opacity = 0.12;
        grid.material.depthWrite = false;
        this.world.add(grid);
        this.grid = grid;
    }

    createAirspacePoints(count) {
        const positions = new Float32Array(count * 3);
        for (let index = 0; index < count; index += 1) {
            positions[index * 3] = (this.random() - 0.5) * 17;
            positions[index * 3 + 1] = (this.random() - 0.5) * 8;
            positions[index * 3 + 2] = (this.random() - 0.5) * 8 - 1;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: this.colors.primary,
            size: 0.055,
            opacity: 0.32,
            transparent: true,
            depthWrite: false
        });
        this.points = new THREE.Points(geometry, material);
        this.world.add(this.points);
    }

    createNetwork(count) {
        const nodes = [];
        const linePositions = [];
        const nodeGeometry = new THREE.SphereGeometry(0.055, 8, 8);
        const nodeMaterial = new THREE.MeshBasicMaterial({ color: this.colors.accent, transparent: true, opacity: 0.48 });

        for (let index = 0; index < count; index += 1) {
            const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
            node.position.set((this.random() - 0.5) * 10, (this.random() - 0.5) * 5.4, (this.random() - 0.5) * 2 - 1);
            nodes.push(node);
            this.world.add(node);
            if (index > 0) {
                const prior = nodes[Math.floor(this.random() * index)];
                linePositions.push(prior.position.x, prior.position.y, prior.position.z, node.position.x, node.position.y, node.position.z);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const material = new THREE.LineBasicMaterial({ color: this.colors.secondary, transparent: true, opacity: 0.16 });
        this.network = new THREE.LineSegments(geometry, material);
        this.world.add(this.network);
    }

    createThemeObjects() {
        if (this.theme === 'home') this.createDroneAndRoute();
        if (this.theme === 'publication' || this.theme === 'direction') this.createArchivePlanes();
        if (this.theme === 'group') this.createCommunityOrbit();
        if (this.theme === 'resource') this.createMissionRings();
    }

    createDroneAndRoute() {
        const drone = new THREE.Group();
        const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f7f1, roughness: 0.68, metalness: 0.14 });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: this.colors.accent, roughness: 0.54, metalness: 0.12 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.58, 5, 10), shellMaterial);
        body.rotation.z = Math.PI / 2;
        drone.add(body);

        [-1, 1].forEach((x) => {
            [-1, 1].forEach((y) => {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.045, 0.045), shellMaterial);
                arm.position.set(x * 0.38, y * 0.18, 0);
                arm.rotation.z = y * 0.48;
                drone.add(arm);
                const rotor = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 24), accentMaterial);
                rotor.position.set(x * 0.68, y * 0.42, 0);
                drone.add(rotor);
            });
        });

        drone.position.set(2.65, 0.45, -0.2);
        drone.rotation.set(0.18, -0.42, -0.08);
        this.world.add(drone);
        this.drone = drone;

        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-5.8, -1.3, -1.6),
            new THREE.Vector3(-3.2, 0.2, -0.8),
            new THREE.Vector3(-0.6, -0.2, 0.1),
            new THREE.Vector3(2.3, 0.5, -0.1),
            new THREE.Vector3(5.4, -0.6, -1.2)
        ]);
        const routeGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(54));
        const routeMaterial = new THREE.LineBasicMaterial({ color: this.colors.accent, transparent: true, opacity: 0.42 });
        this.route = new THREE.Line(routeGeometry, routeMaterial);
        this.world.add(this.route);
        this.createMissionRings();
    }

    createArchivePlanes() {
        const material = new THREE.MeshBasicMaterial({ color: this.colors.primary, transparent: true, opacity: 0.06, side: THREE.DoubleSide });
        const edgeMaterial = new THREE.LineBasicMaterial({ color: this.colors.primary, transparent: true, opacity: 0.18 });
        this.archivePlanes = new THREE.Group();
        for (let index = 0; index < 7; index += 1) {
            const planeGeometry = new THREE.PlaneGeometry(1.15, 1.55);
            const plane = new THREE.Mesh(planeGeometry, material);
            plane.position.set(-4.5 + index * 1.5, (index % 2 ? 0.7 : -0.45), -1.6 - index * 0.08);
            plane.rotation.set(0.04 * index, -0.08 * index, (index - 3) * 0.025);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry), edgeMaterial);
            plane.add(edges);
            this.archivePlanes.add(plane);
        }
        this.world.add(this.archivePlanes);
    }

    createCommunityOrbit() {
        const ringMaterial = new THREE.MeshBasicMaterial({ color: this.colors.primary, transparent: true, opacity: 0.1 });
        this.orbits = new THREE.Group();
        [1.7, 2.7, 3.8].forEach((radius, index) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 6, 96), ringMaterial);
            ring.position.set(2.7, -0.2, -1.4 - index * 0.12);
            ring.rotation.set(0.2 + index * 0.08, 0.18, index * 0.25);
            this.orbits.add(ring);
        });
        this.world.add(this.orbits);
    }

    createMissionRings() {
        const ringMaterial = new THREE.MeshBasicMaterial({ color: this.colors.accent, transparent: true, opacity: 0.12 });
        this.radar = new THREE.Group();
        [0.8, 1.35, 1.9].forEach((radius) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 6, 96), ringMaterial);
            ring.position.set(-2.8, 0.2, -1.8);
            this.radar.add(ring);
        });
        this.world.add(this.radar);
    }

    handlePointer(event) {
        this.pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointerTarget.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    handleResize() {
        if (this.disposed) return;
        this.camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    handleVisibility() {
        this.paused = document.hidden;
        if (!this.paused && !this.animationFrame && !this.disposed) {
            this.clock.getDelta();
            this.render();
        }
    }

    render() {
        this.animationFrame = 0;
        if (this.disposed || this.paused) return;

        const elapsed = this.clock.getElapsedTime();
        this.pointer.lerp(this.pointerTarget, 0.06);
        this.camera.position.x += (this.pointer.x * 0.24 - this.camera.position.x) * 0.035;
        this.camera.position.y += (1.2 + this.pointer.y * 0.16 - this.camera.position.y) * 0.035;
        this.camera.lookAt(0, 0, 0);
        this.world.rotation.y += (this.pointer.x * 0.025 - this.world.rotation.y) * 0.035;
        this.world.rotation.x += (-this.pointer.y * 0.018 - this.world.rotation.x) * 0.035;
        this.points.rotation.y = elapsed * 0.006;
        this.grid.position.x = this.pointer.x * 0.08;
        if (this.drone) {
            this.drone.rotation.z = -0.08 - this.pointer.x * 0.06;
            this.drone.rotation.x = 0.18 + this.pointer.y * 0.05;
            this.drone.position.y = 0.45 + Math.sin(elapsed * 0.7) * 0.045;
        }
        if (this.radar) this.radar.rotation.z = elapsed * 0.018;
        if (this.orbits) this.orbits.rotation.z = elapsed * 0.01;
        if (this.archivePlanes) this.archivePlanes.position.y = Math.sin(elapsed * 0.35) * 0.04;

        this.renderer.render(this.scene, this.camera);
        this.animationFrame = window.requestAnimationFrame(this.render);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('pointermove', this.handlePointer);
        document.removeEventListener('visibilitychange', this.handleVisibility);

        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
            else if (object.material) disposeMaterial(object.material);
        });
        this.renderer.dispose();
        if (typeof this.renderer.forceContextLoss === 'function') this.renderer.forceContextLoss();
        this.canvas.remove();
        document.documentElement.classList.remove('three-airspace-active');
    }
}

export function createAirspaceScene(options = {}) {
    return new AirspaceScene(options.theme || 'default');
}
