const CACHE_NAME = 'energie-pile-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon192x192.png',
    './icon512x512.png'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installation...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Mise en cache des fichiers');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('Service Worker: Tous les fichiers sont en cache');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Erreur de mise en cache', error);
            })
    );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activation...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log('Service Worker: Suppression ancien cache', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activé avec succès');
                return self.clients.claim();
            })
    );
});

// Interception des requêtes (stratégie Cache First)
self.addEventListener('fetch', (event) => {
    // Ignorer les requêtes non-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ignorer les requêtes chrome-extension et autres
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Retourner le cache si disponible
                if (cachedResponse) {
                    // En arrière-plan, mettre à jour le cache
                    fetchAndUpdate(event.request);
                    return cachedResponse;
                }
                
                // Sinon, faire la requête réseau
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Mettre en cache la nouvelle réponse
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Si hors ligne et pas en cache, retourner une page d'erreur
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Fonction pour mettre à jour le cache en arrière-plan
function fetchAndUpdate(request) {
    fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(request, networkResponse);
                    });
            }
        })
        .catch(() => {
            // Silencieux si hors ligne
        });
}

// Écouter les messages du client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('Service Worker: Cache vidé');
        });
    }
});
