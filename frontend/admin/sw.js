const CACHE_NAME = 'admin-cache-v2';
const assets = [
  '/admin/index.html',
  '/admin/css/style.css',
  '/admin/js/api.js',
  '/admin/js/auth.js',
  '/api/settings/pwa/manifest.json'
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
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
