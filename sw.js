const CACHE_NAME = 'energie-pile3.0-v1.1.0';
const CACHE_PREFIX = 'energie-pile';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './sync-maison.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Installation (cache: 'reload' : on prend les fichiers frais du serveur,
// pas une copie périmée du cache du navigateur)
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))
        )
    );
    self.skipWaiting();
});

// Activation - nettoyage des anciens caches de CETTE appli uniquement
// (les autres applis du même site ont leurs propres caches)
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys
                .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
                .map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch - cache first, fallback network
// Seuls les fichiers de l'appli (même origine, GET) passent par le cache :
// les requêtes vers le serveur maison vont toujours directement au réseau.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (new URL(e.request.url).origin !== self.location.origin) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            });
        }).catch(() => {
            if (e.request.destination === 'document') {
                return caches.match('./index.html');
            }
        })
    );
});
