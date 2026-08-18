(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FLYING_INTELLIGENCE_ADMIN_API_FACTORY = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const SESSION_KEY = 'flyingAdminSession';

    function createAdminApi(options) {
        const settings = options || {};
        const baseUrl = String(settings.baseUrl || '').replace(/\/+$/, '');
        const storage = settings.storage;
        const fetcher = settings.fetch;
        if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !storage || typeof fetcher !== 'function') {
            throw new Error('Administrator service is not configured.');
        }

        function token() {
            return storage.getItem(SESSION_KEY) || '';
        }

        function logout() {
            storage.removeItem(SESSION_KEY);
        }

        async function request(path, options) {
            const init = options || {};
            const headers = Object.assign({}, init.headers || {});
            if (init.body !== undefined) headers['Content-Type'] = 'application/json';
            if (init.protected) {
                if (!token()) throw new Error('Administrator session is required.');
                headers.Authorization = `Bearer ${token()}`;
            }
            let response;
            try {
                response = await fetcher(`${baseUrl}${path}`, {
                    method: init.method || 'GET',
                    headers: headers,
                    body: init.body === undefined ? undefined : JSON.stringify(init.body)
                });
            } catch (error) {
                throw new Error('Unable to reach the administrator service.');
            }
            let result = {};
            try { result = await response.json(); }
            catch (error) { result = {}; }
            if (!response.ok) {
                if (response.status === 401) logout();
                throw new Error(typeof result.error === 'string' ? result.error : 'Administrator request failed.');
            }
            return result;
        }

        return {
            hasSession: function () { return Boolean(token()); },
            login: async function (account, password) {
                const result = await request('/auth/login', {
                    method: 'POST',
                    body: { account: account, password: password }
                });
                if (!result || typeof result.token !== 'string' || !result.token) {
                    throw new Error('Administrator service returned an invalid session.');
                }
                storage.setItem(SESSION_KEY, result.token);
                return result;
            },
            logout: logout,
            status: function () { return request('/auth/status', { protected: true }); },
            getState: function () { return request('/state', { protected: true }); },
            publish: function (operation) { return request('/publish', { method: 'POST', protected: true, body: operation }); },
            rollback: function (operation) { return request('/rollback', { method: 'POST', protected: true, body: operation }); }
        };
    }

    return { createAdminApi: createAdminApi, SESSION_KEY: SESSION_KEY };
}));
