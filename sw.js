/**
 * Spoon - Service Worker
 * Handles background push notifications and network-first asset caching.
 */

// Bump CACHE_VERSION whenever a deploy changes frontend assets. On activate, any
// cache that doesn't match the current version is deleted, so users never get
// stale JavaScript/CSS after a deployment.
const CACHE_VERSION = 'spoon-v1';

// --- Lifecycle: take control promptly and clean up old caches ---
self.addEventListener('install', function () {
    // Activate this version immediately instead of waiting for old tabs to close.
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        (async function () {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter(function (k) { return k !== CACHE_VERSION; })
                    .map(function (k) { return caches.delete(k); })
            );
            await self.clients.claim();
        })()
    );
});

// --- Fetch: NETWORK-FIRST so online users always get the latest frontend. ---
// The cache is only a fallback for offline use. API calls, non-GET requests, and
// cross-origin requests are never cached and always go straight to the network.
self.addEventListener('fetch', function (event) {
    const req = event.request;

    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;               // skip cross-origin (CDNs, APIs)
    if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return; // never cache API / the SW

    event.respondWith(
        (async function () {
            try {
                const fresh = await fetch(req);
                // Cache only clean, same-origin 200 responses, in the background.
                if (fresh && fresh.status === 200 && fresh.type === 'basic') {
                    const cache = await caches.open(CACHE_VERSION);
                    cache.put(req, fresh.clone());
                }
                return fresh;
            } catch (err) {
                // Offline (or network error): serve from cache if we have it.
                const cached = await caches.match(req);
                if (cached) return cached;
                throw err;
            }
        })()
    );
});

// --- Push notifications ---
self.addEventListener('push', function (event) {
    if (event.data) {
        const payload = event.data.json();
        const options = {
            body: payload.body,
            icon: payload.icon || '/public/icons/icon-192.png',
            vibrate: [200, 100, 200],
            data: payload.data || { url: '/' }
        };

        event.waitUntil(
            self.registration.showNotification(payload.title, options)
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    // Where to send the user (order-ready -> Orders tab).
    var targetUrl = (event.notification.data && event.notification.data.url) || '/public/orders.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // If a Spoon tab is already open, focus it AND navigate it to the Orders
            // tab (so the user lands on Orders, not whatever page they left open).
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(targetUrl)
                            .then(function (c) { return (c || client).focus(); })
                            .catch(function () { return client.focus(); });
                    }
                    return client.focus();
                }
            }
            // Otherwise open a new window directly on the Orders tab.
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
