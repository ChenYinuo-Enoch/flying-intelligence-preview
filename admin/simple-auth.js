(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FLYING_INTELLIGENCE_SIMPLE_AUTH_API = Object.freeze(api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PLACEHOLDER = 'CHANGE_ME';

    function normalizeAccount(value) {
        return String(value || '').trim();
    }

    function isConfigured(config) {
        const account = normalizeAccount(config && config.account);
        const passwordHash = String(config && config.passwordHash || '').trim().toLowerCase();
        return Boolean(account && account !== PLACEHOLDER && /^[a-f0-9]{64}$/.test(passwordHash));
    }

    async function sha256Hex(value, cryptoApi) {
        const api = cryptoApi || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
        if (!api || !api.subtle) throw new Error('web-crypto-unavailable');
        const bytes = new TextEncoder().encode(String(value));
        const digest = await api.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    async function verifyCredentials(config, account, password, cryptoApi) {
        if (!isConfigured(config)) return false;
        const expectedAccount = normalizeAccount(config.account);
        const expectedHash = String(config.passwordHash).trim().toLowerCase();
        const actualHash = await sha256Hex(password, cryptoApi);
        return normalizeAccount(account) === expectedAccount && actualHash === expectedHash;
    }

    return {
        isConfigured: isConfigured,
        normalizeAccount: normalizeAccount,
        sha256Hex: sha256Hex,
        verifyCredentials: verifyCredentials
    };
}));
