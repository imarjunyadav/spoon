/**
 * Spoon - PWA Install Prompt (deferred)
 *
 * Registers the service worker (idempotent with pushManager) and offers a custom,
 * non-intrusive "Install Spoon" banner ONLY after the user has used Spoon a few
 * times — never on first visit and never on Login/Signup (this script is only
 * included on the main app page). Fully self-contained: injects its own styles.
 */
(function () {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    // Ensure the SW is registered early so the browser can offer installation.
    // Safe to call alongside pushManager's registration (same URL + scope).
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () { /* ignore */ });
    });

    var VISIT_KEY = 'spoon-visit-count';
    var DISMISS_KEY = 'spoon-install-dismissed';
    var THRESHOLD = 2; // only offer after a couple of successful sessions
    var deferredPrompt = null;

    // Count this visit.
    try {
        var n = (parseInt(localStorage.getItem(VISIT_KEY), 10) || 0) + 1;
        localStorage.setItem(VISIT_KEY, String(n));
    } catch (e) { /* storage unavailable */ }

    function eligible() {
        try {
            if (localStorage.getItem(DISMISS_KEY) === '1') return false;
            if ((parseInt(localStorage.getItem(VISIT_KEY), 10) || 0) < THRESHOLD) return false;
        } catch (e) { return false; }
        // Already installed / launched from the home screen?
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return false;
        return true;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();      // suppress the browser's automatic mini-infobar
        deferredPrompt = e;
        // On pages that have the header "Get App" button (the menu), that button is the
        // install CTA — don't also pop the bottom banner. Elsewhere, keep the banner.
        if (eligible() && !document.getElementById('get-app-btn')) showBanner();
    });

    window.addEventListener('appinstalled', function () {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
        removeBanner();
        hidePromo();
    });

    function injectStyles() {
        if (document.getElementById('spoon-pwa-style')) return;
        var s = document.createElement('style');
        s.id = 'spoon-pwa-style';
        s.textContent =
            '.spoon-install-banner{position:fixed;left:12px;right:12px;bottom:12px;max-width:520px;margin:0 auto;' +
            'background:#fff;color:#1f2937;border:1px solid #eee;border-radius:14px;padding:12px 14px;' +
            'box-shadow:0 8px 28px rgba(0,0,0,.18);z-index:9998;display:flex;align-items:center;gap:12px;font-size:14px}' +
            '.spoon-install-banner img{width:40px;height:40px;border-radius:9px;flex-shrink:0}' +
            '.spoon-install-banner .spoon-install-text{flex:1;line-height:1.3}' +
            '.spoon-install-banner .spoon-install-text small{color:#777;font-size:12px}' +
            '.spoon-install-banner button{border:none;border-radius:9px;padding:9px 14px;font-weight:600;font-size:14px;cursor:pointer}' +
            '.spoon-install-banner .spoon-install-yes{background:#eb1700;color:#fff}' +
            '.spoon-install-banner .spoon-install-no{background:transparent;color:#999;padding:9px 6px}';
        document.head.appendChild(s);
    }

    function removeBanner() {
        var el = document.getElementById('spoon-install-banner');
        if (el) el.remove();
    }

    function showBanner() {
        if (document.getElementById('spoon-install-banner')) return;
        injectStyles();

        var bar = document.createElement('div');
        bar.className = 'spoon-install-banner';
        bar.id = 'spoon-install-banner';
        bar.innerHTML =
            '<img src="/public/icons/icon-192.png" alt="Spoon">' +
            '<div class="spoon-install-text">Install Spoon<br><small>Quick access from your home screen</small></div>' +
            '<button class="spoon-install-no" id="spoon-install-no">Not now</button>' +
            '<button class="spoon-install-yes" id="spoon-install-yes">Install</button>';
        document.body.appendChild(bar);

        document.getElementById('spoon-install-yes').addEventListener('click', function () {
            removeBanner();
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
        });
        document.getElementById('spoon-install-no').addEventListener('click', function () {
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
            removeBanner();
        });
    }

    // ---------- In-page install promo (menu page) ----------

    function isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true;
    }

    function hidePromo() {
        var btn = document.getElementById('get-app-btn');
        if (btn) btn.setAttribute('hidden', '');
    }

    // Fallback for browsers that don't fire beforeinstallprompt (e.g. iOS Safari):
    // tell the user how to install manually.
    function installHint() {
        var msg = /iphone|ipad|ipod/i.test(navigator.userAgent)
            ? "To install: tap the Share button, then 'Add to Home Screen'."
            : "To install: open your browser menu and choose 'Install app' / 'Add to Home Screen'.";
        if (typeof window.showToast === 'function') window.showToast(msg, 'info', 5000);
        else alert(msg);
    }

    function wireGetApp() {
        var btn = document.getElementById('get-app-btn');
        if (!btn) return;                 // not on this page
        if (isStandalone()) { hidePromo(); return; } // already installed — hide the button

        btn.addEventListener('click', function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function (choice) {
                    if (choice && choice.outcome === 'accepted') hidePromo();
                    deferredPrompt = null;
                }).catch(function () { deferredPrompt = null; });
            } else {
                installHint();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireGetApp);
    } else {
        wireGetApp();
    }
})();
