/**
 * Service Worker for Privacy Messaging PWA
 *
 * IMPORTANT PRIVACY NOTE:
 * This service worker CANNOT decrypt messages (no access to private keys).
 * Notifications are created by the main app when the tab is in the background.
 * This worker only handles:
 * - App shell caching for offline support
 * - Notification click handling (focus window & navigate)
 */

const CACHE_NAME = 'privacy-messaging-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('[SW] Failed to cache app shell:', error);
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip relay server requests (always go to network)
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('/ws')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Network failed - try cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', event.request.url);
              return cachedResponse;
            }
            // No cache available
            return new Response('Offline - no cached version available', {
              status: 503,
              statusText: 'Service Unavailable',
            });
          });
      })
  );
});

// Notification click event - focus window and navigate to conversation
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  const conversationId = event.notification.data?.conversationId;
  const url = conversationId
    ? `${self.location.origin}/#conversation=${conversationId}`
    : self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        console.log('[SW] Found', clientList.length, 'open windows');

        // Check if app is already open
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            console.log('[SW] Focusing existing window');
            // Navigate to conversation
            client.postMessage({
              type: 'NAVIGATE_TO_CONVERSATION',
              conversationId,
            });
            return client.focus();
          }
        }

        // No window open - open new one
        if (clients.openWindow) {
          console.log('[SW] Opening new window:', url);
          return clients.openWindow(url);
        }
      })
      .catch(error => {
        console.error('[SW] Failed to handle notification click:', error);
      })
  );
});

// Message event - handle commands from main app
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
