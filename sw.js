// ObraManager Pro - Service Worker
// Permite uso offline y cacheo de recursos

const CACHE_NAME = 'obramanager-v1';

// Recursos externos que queremos cachear (CDNs)
const EXTERNAL_RESOURCES = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// Recursos locales
const LOCAL_RESOURCES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Instalación: cachear todo lo posible ──────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando ObraManager Pro...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cachear recursos locales (críticos)
      try {
        await cache.addAll(LOCAL_RESOURCES);
        console.log('[SW] Recursos locales cacheados');
      } catch (e) {
        console.warn('[SW] Error cacheando recursos locales:', e);
      }

      // Cachear recursos externos (no crítico si falla)
      for (const url of EXTERNAL_RESOURCES) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('[SW] No se pudo cachear:', url);
        }
      }
    })
  );
});

// ── Activación: limpiar cachés antiguas ───────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activado');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first para recursos estáticos, Network-first para Firebase ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase y APIs siempre van a la red (datos en tiempo real)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('emailjs') ||
    url.pathname.includes('/v1/messages')
  ) {
    return; // Deja que el navegador lo maneje normalmente
  }

  // Para todo lo demás: Cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Servir desde caché y actualizar en segundo plano
        const networkUpdate = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
              });
            }
            return response;
          })
          .catch(() => {});
        return cached;
      }

      // No está en caché: ir a la red
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, toCache);
        });
        return response;
      }).catch(() => {
        // Sin red y sin caché: página de error offline simple
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
