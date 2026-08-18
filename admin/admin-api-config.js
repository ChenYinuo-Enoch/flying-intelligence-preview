(function () {
    'use strict';
    const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    window.FLYING_INTELLIGENCE_ADMIN_API_CONFIG = Object.freeze({
        baseUrl: local ? `${location.protocol}//${location.hostname}:8787` : '',
        allowWrites: !local
    });
}());
