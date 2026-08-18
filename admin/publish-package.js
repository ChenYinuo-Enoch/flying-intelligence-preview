(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FLYING_INTELLIGENCE_PUBLISH_PACKAGE = Object.freeze(api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const UPDATE_TYPES = new Set(['add_member', 'add_publication', 'member_status']);
    const PREVIEW_SITE = 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/';

    function compactUtc(date) {
        return date.toISOString()
            .replace(/[-:]/g, '')
            .replace('T', '-')
            .replace(/\.\d{3}Z$/, '');
    }

    function browserRandomId() {
        const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
            return cryptoApi.randomUUID().replace(/-/g, '').slice(0, 8);
        }
        if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
            const values = new Uint32Array(1);
            cryptoApi.getRandomValues(values);
            return values[0].toString(16).padStart(8, '0');
        }
        return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    }

    function createPublishPackage(options) {
        const settings = options || {};
        if (!UPDATE_TYPES.has(settings.updateType)) throw new Error('Unsupported update type.');
        const baseCommitSha = String(settings.baseCommitSha || '').trim().toLowerCase();
        if (baseCommitSha && !/^[a-f0-9]{40}$/.test(baseCommitSha)) throw new Error('Base commit SHA is invalid.');
        const now = settings.now instanceof Date ? settings.now : new Date();
        if (Number.isNaN(now.getTime())) throw new Error('Package creation time is invalid.');
        const randomId = String(settings.randomId || browserRandomId()).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
        if (randomId.length !== 8) throw new Error('Package identifier is invalid.');
        const updateId = `${compactUtc(now)}-${randomId}`;
        return {
            schemaVersion: 1,
            updateId: updateId,
            updateType: settings.updateType,
            createdAt: now.toISOString(),
            baseCommitSha: baseCommitSha,
            previewSite: PREVIEW_SITE,
            targetEnvironment: 'preview',
            content: JSON.parse(JSON.stringify(settings.content || {}))
        };
    }

    function packageFileName(payload) {
        if (!payload || !/^[A-Za-z0-9._-]+$/.test(payload.updateId || '')) throw new Error('Package identifier is invalid.');
        return `flying-admin-update-${payload.updateId}.json`;
    }

    function serializePublishPackage(payload) {
        return `${JSON.stringify(payload, null, 2)}\n`;
    }

    function stagingCommand(packagePath) {
        const escaped = String(packagePath || '').replace(/`/g, '``').replace(/"/g, '`"');
        return `.\\tools\\stage-admin-update.ps1 -PackagePath "${escaped}"`;
    }

    return {
        PREVIEW_SITE: PREVIEW_SITE,
        UPDATE_TYPES: UPDATE_TYPES,
        createPublishPackage: createPublishPackage,
        packageFileName: packageFileName,
        serializePublishPackage: serializePublishPackage,
        stagingCommand: stagingCommand
    };
}));
