// Service Worker: cache-first สำหรับไฟล์แอป เพื่อใช้งานออฟไลน์
// เปลี่ยน VERSION ทุกครั้งที่แก้ไฟล์แอป เพื่อให้แคชใหม่
const VERSION = 'v1';
const CACHE = `onepiece-vault-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/db.js', './js/ui.js',
  './js/lib/timecode.js', './js/lib/search.js', './js/lib/backup.js',
  './js/views/search.js', './js/views/episodes.js', './js/views/episode.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
