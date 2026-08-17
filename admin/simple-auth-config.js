(function () {
    'use strict';

    /*
     * This is a client-side convenience gate, not secure authentication.
     * Anyone who can download the site can inspect or bypass it. Never reuse a
     * sensitive password here. See SETUP.md before replacing the placeholders.
     */
    window.FLYING_INTELLIGENCE_SIMPLE_AUTH = Object.freeze({
        account: 'flying-admin',
        passwordHash: 'f450f5929cffc2a4e8de06631e7a84dada89dd3cc4a0040344cd09c6f5288b76'
    });
}());
