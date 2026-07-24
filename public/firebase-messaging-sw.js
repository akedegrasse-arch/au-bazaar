// ---------------------------------------------------------------------------
// Push (FCM). Wrapped in try/catch: if the Firebase scripts can't load - e.g.
// the service worker wakes up while OFFLINE - the offline caching further down
// must still register. Without this guard a failed importScripts would abort
// the whole worker and break offline page loads.
// ---------------------------------------------------------------------------
let messaging = null;
try {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    projectId: "aubazaar-12d35",
    appId: "1:711155540514:web:26c64d452b9f62d68de07b",
    storageBucket: "aubazaar-12d35.firebasestorage.app",
    apiKey: "AIzaSyD3Vu-kHTGeReLgBPyUQZfC629gau_4qys",
    authDomain: "aubazaar-12d35.firebaseapp.com",
    messagingSenderId: "711155540514"
  });

  messaging = firebase.messaging();

  // Fires when a push arrives while no AUBazaar tab has focus - this is the
  // piece that makes it work even with the site fully closed, since the
  // service worker runs independently of any open tab.
  messaging.onBackgroundMessage((payload) => {
    // Messages are sent DATA-ONLY (see the Cloud Function) so this handler is
    // the single place a notification is shown - no FCM auto-display, so no
    // duplicate. Everything comes from payload.data.
    const d = payload.data || {};
    const title = d.title || 'AUBazaar';
    const options = {
      body: d.body || '',
      icon: '/favicon.png',
      badge: '/favicon.png',
      // Per-sender tag + renotify: repeat messages from the same person
      // re-alert you without piling up dozens of separate notifications.
      tag: d.tag || ('aubazaar-msg-' + Date.now()),
      renotify: true,
      data: { url: d.link || '/messages' }
    };
    self.registration.showNotification(title, options);

    // Also put a badge on the installed app's icon. The worker doesn't know
    // the exact unread count, so show a dot; opening the app recomputes the
    // real count (and clears it once messages are read).
    if (self.navigator && self.navigator.setAppBadge) {
      self.navigator.setAppBadge().catch(() => {});
    }
  });
} catch (e) {
  // Firebase messaging couldn't load (most likely offline). Push won't work
  // for this worker start, but offline caching below still registers.
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/messages';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Offline app-shell caching.
//
// Strategy: NETWORK-FIRST. We always try the live version (so a fresh deploy
// reaches people immediately - no "stuck on an old cached build" trap),
// refresh the cache with each success, and fall back to the cache only when
// the network fails (offline). We cache the app's own files AND the static
// CDN scripts it needs (Firebase SDK, SweetAlert, Font Awesome) so a page can
// fully load offline - but we NEVER cache the Firebase/Google API calls
// (Firestore has its own offline cache; auth/storage must hit the network).
// ---------------------------------------------------------------------------
const CACHE = 'aubazaar-shell-v1';
const PRECACHE = ['/', '/marketplace', '/js/firebase-config.js', '/manifest.json', '/favicon.png'];
// API endpoints we must never cache - let them always go to the network.
const API_HOSTS = [
  'firestore.googleapis.com', 'firebasestorage.googleapis.com',
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com', 'fcmregistrations.googleapis.com',
  'firebaseremoteconfig.googleapis.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {})) // a missing file mustn't block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // never cache writes
  const url = new URL(req.url);
  // Skip the live API calls (Firestore/Auth/Storage) - always network.
  if (API_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('/marketplace') : undefined)
        )
      )
  );
});
