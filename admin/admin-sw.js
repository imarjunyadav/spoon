const CACHE_NAME = 'spoon-admin-v2';
const PRECACHE_URLS = [
    '/admin/admin-dashboard.html',
    '/css/admin-dashboard.css',
    '/js/admin/admin-dashboard.js',
    '/favicon.svg',
    '/admin/icons/icon.svg',
    '/admin/admin-manifest.json',
    '/admin/ElevenLabs_Positive_chime_for_accepted_user_input.mp3',
];

function isApiOrRealtime(url) {
    return (
        url.pathname.startsWith('/api/') ||
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')
    );
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .catch(() => {})
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('spoon-admin-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    let url;
    try { url = new URL(event.request.url); } catch { return; }
    if (isApiOrRealtime(url)) return;

    if (url.pathname.endsWith('.html')) {
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(res => {
                if (res.ok) {
                    caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
                }
                return res;
            }).catch(() => cached);
            return cached || networkFetch;
        })
    );
});
