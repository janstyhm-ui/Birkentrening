const cacheName = 'birken-static-v1';
const assets = [
  './', './index.html', './app.js', './style.css', './manifest.webmanifest',
  './program.json', './exercises.json', './assets/terrain.svg', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('./exercises.json', {cache:'reload'});
    if (!response.ok) throw new Error('Kunne ikke laste øvelsesbiblioteket');
    const library = await response.json();
    const images = [...library.A, ...library.B].map(e => e.image).filter(Boolean);
    const cache = await caches.open(cacheName);
    await cache.addAll([...new Set([...assets,...images])].map(path => new Request(new URL(path,self.location), {cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('birken-static-') && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request.mode === 'navigate' ? new URL('./index.html',self.location) : request);
    return cached ?? fetch(request);
  })());
});
