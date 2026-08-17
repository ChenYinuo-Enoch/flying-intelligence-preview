(function () {
    'use strict';

    /*
     * This is a client-side convenience gate, not secure authentication.
     * Anyone who can download the site can inspect or bypass it. Never reuse a
     * sensitive password here. See SETUP.md before replacing the placeholders.
     */
    window.FLYING_INTELLIGENCE_SIMPLE_AUTH = Object.freeze({
        account: 'CHANGE_ME',
        passwordHash: 'CHANGE_ME'
    });
}());
