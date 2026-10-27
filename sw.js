// Caudal: guarda la app en el teléfono para abrir rápido y sin internet.
const CACHE = 'caudal-v112';
const SHELL = ['./', './index.html', './supabase.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Red primero para tener siempre la última versión; si no hay internet, la copia guardada.
  e.respondWith(fetch(e.request, { cache:'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

// Avisos: notificaciones que manda la función "avisos" de Supabase.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title:'Caudal', body:e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Caudal', { body:d.body || '', tag:d.tag || 'caudal', icon:'./icon-192.png', badge:'./icon-192.png', data:{ url:d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(cs => { for (const c of cs) { if ('focus' in c) return c.focus(); } return self.clients.openWindow(e.notification.data && e.notification.data.url || './'); }));
});
