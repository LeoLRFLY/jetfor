/* JetFor · Controle de Manutenção — Service Worker (PWA) */
const CACHE = 'jetfor-mnt-v36';
const SHELL = [
  './', './index.html', './app.js', './config.js', './data.js',
  './freq_data.js', './dash_data.js', './da_data.js', './acmaps_data.js', './patch_data.js', './reclass_data.js', './full_data.js', './iio_data.js', './forms.js', './docs.js', './auditorias.js',
  './favicon.ico', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Requisições externas (Firebase, gstatic) → deixa a rede cuidar
  if (url.origin !== self.location.origin) return;
  // App shell → network-first com fallback ao cache (funciona offline)
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});
