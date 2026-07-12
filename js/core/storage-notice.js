/**
 * Spoon - Local Storage Notice
 *
 * Shows a small, one-time, dismissible notice informing users that Spoon stores
 * login/session information in the browser's local storage. Self-contained: it
 * injects its own element (styled by css/legal.css) and remembers dismissal.
 */
(function () {
    'use strict';

    var KEY = 'spoon-storage-notice-dismissed';

    try {
        if (localStorage.getItem(KEY) === '1') return; // already dismissed
    } catch (e) {
        return; // storage unavailable; nothing to notify about
    }

    function build() {
        if (document.getElementById('spoon-storage-notice')) return;

        var bar = document.createElement('div');
        bar.className = 'storage-notice';
        bar.id = 'spoon-storage-notice';
        bar.setAttribute('role', 'note');
        bar.innerHTML =
            '<span>Spoon stores your login/session in your browser\'s local storage to keep you signed in. ' +
            'See our <a href="privacy.html">Privacy Policy</a>.</span>' +
            '<button type="button" class="storage-notice__btn" id="spoon-storage-notice-ok">Got it</button>';

        document.body.appendChild(bar);

        document.getElementById('spoon-storage-notice-ok').addEventListener('click', function () {
            try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
            bar.remove();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
