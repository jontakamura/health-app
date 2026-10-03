const CACHE = 'healthbot-v7';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// stale-while-revalidate: instant + offline, picks up updates on next launch
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit || (req.mode === 'navigate' ? c.match('index.html') : undefined));
    return hit || net;
  }));
});
