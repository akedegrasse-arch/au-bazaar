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

const messaging = firebase.messaging();

// Fires when a push arrives while no AUBazaar tab has focus - this is the
// piece that makes it work even with the site fully closed, since the
// service worker runs independently of any open tab.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'AUBazaar';
  const options = {
    body: payload.notification?.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: payload.fcmOptions?.link || payload.data?.link || '/messages' }
  };
  self.registration.showNotification(title, options);
});

// A pass-through fetch handler - required by some browsers' PWA
// installability checks, and a minimal foundation for offline support
// later. Doesn't cache or intercept anything yet, just lets requests
// through normally.
self.addEventListener('fetch', () => {});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/messages';
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
