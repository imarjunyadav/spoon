/**
 * Spoon - User Web Push Manager
 *
 * Subscribes a LOGGED-IN student's device to order-update push notifications
 * (order ready, no-show cancellation) so they get alerts even when the PWA/tab
 * is closed. Uses the user session headers (x-user-email / x-session-token) and
 * the /api/user-push/* endpoints — fully independent of the admin push system.
 *
 * UX: never auto-prompts. Shows a deferred, dismissible banner that asks the user
 * to enable notifications; permission is only requested on that explicit tap.
 * Also exposes window.spoonUserPush.enable() for a manual trigger (e.g. a toggle).
 */
(function () {
    'use strict';

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    var DISMISS_KEY = 'spoon-user-push-dismissed';
    var vapidKey = null;
    var swReg = null;

    function isLoggedIn() {
        try {
            return localStorage.getItem('spoon-is-logged-in') === 'true'
                && !!localStorage.getItem('spoon-user-email')
                && !!localStorage.getItem('spoon-session-token');
        } catch (e) { return false; }
    }

    function authHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-user-email': localStorage.getItem('spoon-user-email') || '',
            'x-session-token': localStorage.getItem('spoon-session-token') || ''
        };
    }

    function apiBase() {
        return (window.SPOON_CONFIG && window.SPOON_CONFIG.API_BASE_URL) || '';
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        var raw = window.atob(base64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    async function subscribe() {
        if (!swReg || !vapidKey || !isLoggedIn()) return;
        try {
            var sub = await swReg.pushManager.getSubscription();
            var isNew = false;
            if (!sub) {
                sub = await swReg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
                isNew = true;
            }
            // Avoid a redundant backend upsert on every page load: sync once per
            // browser session, or whenever a brand-new subscription is created.
            if (!isNew) {
                try { if (sessionStorage.getItem('spoon-push-synced') === '1') return; } catch (e) { /* ignore */ }
            }
            var resp = await fetch(apiBase() + '/api/user-push/subscribe', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ subscription: sub })
            });
            if (resp.ok) {
                try { sessionStorage.setItem('spoon-push-synced', '1'); } catch (e) { /* ignore */ }
                console.log('📡 User push subscribed');
            } else {
                console.warn('⚠️ User push subscribe rejected:', resp.status);
            }
        } catch (e) {
            console.warn('⚠️ User push subscribe failed:', e);
        }
    }

    async function enable() {
        removeBanner();
        try {
            var perm = await Notification.requestPermission();
            if (perm === 'granted') {
                await subscribe();
                // In-app confirmation (NOT a push) so the user knows it worked.
                if (typeof window.showToast === 'function') {
                    window.showToast("🔔 You'll be notified when your order is ready", 'success');
                }
            } else {
                // Denied or dismissed — respect it and don't ask again.
                try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.warn('⚠️ Notification permission request failed:', e);
        }
    }

    function eligibleForBanner() {
        if (!isLoggedIn()) return false;
        if (Notification.permission !== 'default') return false; // granted handled elsewhere; denied respected
        try { if (localStorage.getItem(DISMISS_KEY) === '1') return false; } catch (e) { return false; }
        return true;
    }

    function injectStyles() {
        if (document.getElementById('spoon-userpush-style')) return;
        var s = document.createElement('style');
        s.id = 'spoon-userpush-style';
        s.textContent =
            '.spoon-push-banner{position:fixed;left:12px;right:12px;bottom:12px;max-width:520px;margin:0 auto;' +
            'background:#fff;color:#1f2937;border:1px solid #eee;border-radius:14px;padding:12px 14px;' +
            'box-shadow:0 8px 28px rgba(0,0,0,.18);z-index:9998;display:flex;align-items:center;gap:12px;font-size:14px}' +
            '.spoon-push-banner .spoon-push-emoji{font-size:26px;flex-shrink:0}' +
            '.spoon-push-banner .spoon-push-text{flex:1;line-height:1.3}' +
            '.spoon-push-banner .spoon-push-text small{color:#777;font-size:12px}' +
            '.spoon-push-banner button{border:none;border-radius:9px;padding:9px 14px;font-weight:600;font-size:14px;cursor:pointer}' +
            '.spoon-push-banner .spoon-push-yes{background:#eb1700;color:#fff}' +
            '.spoon-push-banner .spoon-push-no{background:transparent;color:#999;padding:9px 6px}';
        document.head.appendChild(s);
    }

    function removeBanner() {
        var el = document.getElementById('spoon-push-banner');
        if (el) el.remove();
    }

    function showBanner() {
        if (!eligibleForBanner()) return;
        if (document.getElementById('spoon-push-banner')) return;
        injectStyles();

        var bar = document.createElement('div');
        bar.className = 'spoon-push-banner';
        bar.id = 'spoon-push-banner';
        bar.innerHTML =
            '<span class="spoon-push-emoji">🔔</span>' +
            '<div class="spoon-push-text">Get order updates<br><small>Know the moment your food is ready</small></div>' +
            '<button class="spoon-push-no" id="spoon-push-no">Not now</button>' +
            '<button class="spoon-push-yes" id="spoon-push-yes">Enable</button>';
        document.body.appendChild(bar);

        document.getElementById('spoon-push-yes').addEventListener('click', enable);
        document.getElementById('spoon-push-no').addEventListener('click', function () {
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
            removeBanner();
        });
    }

    async function init() {
        try {
            swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            var r = await fetch(apiBase() + '/api/user-push/key');
            if (r.ok) vapidKey = (await r.json()).key;
        } catch (e) {
            return; // push unavailable / not configured
        }
        if (!vapidKey || !isLoggedIn()) return;

        if (Notification.permission === 'granted') {
            subscribe();                    // keep returning users in sync
        } else if (eligibleForBanner()) {
            setTimeout(showBanner, 4000);   // deferred + non-intrusive
        }
    }

    // Manual trigger for an optional in-app toggle/button.
    window.spoonUserPush = { enable: enable, subscribe: subscribe };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
