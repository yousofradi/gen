const CACHE_NAME = 'admin-cache-v3';
const assets = [
  'index.html',
  'css/style.css',
  'js/api.js',
  'js/auth.js',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(assets)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )));
});

self.addEventListener('fetch', e => {
  // Skip caching for API requests and cross-origin calls
  if (e.request.url.includes('/api/')) {
    return; // Let it fall through to the network naturally
  }
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});

// ── Push Notification Handler ──
self.addEventListener('push', event => {
  let data = { title: 'Sundura Admin', body: 'New notification' };
  try {
    data = event.data.json();
  } catch (e) {
    console.log('Push data is not JSON, using as text');
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: data.icon || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    badge: '/admin/favicon.ico',
    data: data.data || {},
    vibrate: [200, 100, 200], // Kaching vibration pattern
    sound: data.sound || 'https://cdn.pixabay.com/audio/2022/11/04/audio_7650b73fdb.mp3',
    tag: 'order-notification',
    renotify: true
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PUSH_RECEIVED', data });
        });
      })
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/admin/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
