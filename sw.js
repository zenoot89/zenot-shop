// ─── SERVICE WORKER — zenOt Shop PWA ──────────────────────────
// Strategi (sama seperti zenoot-app):
// - index.html        → SELALU network (tidak pernah cache)
// - JS app files      → SELALU network (tidak pernah cache)
// - CDN (font, supabase-js) → cache-first (jarang berubah)
// - Gambar/manifest/wilayah-* → cache-first
// Dengan strategi ini, update file JS langsung terasa tanpa perlu
// unregister SW atau hard refresh.

var CACHE_VERSION = 'zenot-shop-static-v1';
var CACHE_CDN     = 'zenot-shop-cdn-v1';

// Hanya file statis yang boleh di-cache (tidak pernah berubah setelah deploy)
var STATIC_ASSETS = [
  './manifest.json',
  './favicon.ico',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

var CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,400&family=Space+Grotesk:wght@500;700&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// File JS — network-first: selalu ambil versi terbaru, fallback cache kalau offline
var JS_APP_FILES = [
  'admin-products.js',
];
// index.html selalu dari network agar versi SW terbaru langsung aktif
var NO_CACHE_PATTERNS = ['index.html'];

// ─── CARA DEPLOY UPDATE ─────────────────────────────────────
// Setiap upload file JS/HTML baru ke hosting:
// 1. Jalankan di terminal:  node -e "d=new Date();console.log('zenot-shop-js-'+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)+'-'+('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2))"
// 2. Copy hasilnya ke baris JS_CACHE di bawah.
// 3. Upload sw.js → browser deteksi SW berubah → auto update tanpa Ctrl+Shift+R.
// ─────────────────────────────────────────────────────────────
var JS_CACHE = 'zenot-shop-js-20260825-init'; // setup awal: tambah sw.js + auto-update mechanism

// ─── SKIP WAITING ────────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION).then(function(c) {
        return Promise.all(STATIC_ASSETS.map(function(url) {
          return c.add(url).catch(function(err) {
            console.warn('[SW] Gagal cache static:', url, err);
          });
        }));
      }),
      caches.open(CACHE_CDN).then(function(c) {
        return Promise.all(CDN_ASSETS.map(function(url) {
          return c.add(url).catch(function(err) {
            console.warn('[SW] Gagal cache CDN:', url, err);
          });
        }));
      })
    ])
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    // STEP 1: Pre-cache semua JS files ke JS_CACHE BARU dulu SEBELUM hapus cache lama.
    // Fix: isi JS_CACHE baru dari network, kalau gagal skip (jangan fallback ke cache lama).
    caches.open(JS_CACHE).then(function(newCache) {
      return Promise.all(
        JS_APP_FILES.map(function(file) {
          var url = './' + file;
          return fetch(url, { cache: 'no-store' }).then(function(res) {
              if (res.ok) return newCache.put(url, res);
            }).catch(function() {
              // Network gagal → skip, jangan fallback ke cache lama (bisa serve versi stale)
            });
        })
      );
    })
    // STEP 2: Baru hapus cache lama setelah JS_CACHE baru sudah terisi
    .then(function() {
      return caches.keys().then(function(keys) {
        var kept = [CACHE_VERSION, CACHE_CDN, JS_CACHE];
        return Promise.all(
          keys.filter(function(k) { return kept.indexOf(k) === -1; })
              .map(function(k) { return caches.delete(k); })
        );
      });
    })
    .then(function() {
      return self.clients.claim();
    })
    .then(function() {
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(c) { c.postMessage({ type: 'SW_UPDATED' }); });
      });
    })
  );
});

// ─── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Supabase → selalu network, tidak cache, TIDAK ADA fallback palsu.
  // Biarin promise fetch aslinya reject kalau network gagal, supaya error
  // nyampe asli ke caller (bukan silently kosong/stale).
  if (url.indexOf('supabase.co') !== -1) {
    e.respondWith(fetch(e.request));
    return;
  }

  // CDN → cache-first
  if (url.indexOf('fonts.googleapis.com') !== -1 ||
      url.indexOf('fonts.gstatic.com')    !== -1 ||
      url.indexOf('cdn.jsdelivr.net')     !== -1) {
    e.respondWith(
      caches.open(CACHE_CDN).then(function(c) {
        return c.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(res) {
            if (res.ok) c.put(e.request, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // index.html → selalu network
  // e.request.mode === 'navigate' menangkap SEMUA top-level page load (root,
  // buka dari PWA icon, bookmark, dll) — bukan cuma URL yang literal
  // mengandung string 'index.html'.
  var isNoCache = e.request.mode === 'navigate' ||
    NO_CACHE_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
  if (isNoCache) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(function() { return caches.match(e.request); }));
    return;
  }

  // File JS app → network-first (selalu ambil versi terbaru)
  // Fallback ke cache hanya kalau benar-benar offline
  var isJsFile = JS_APP_FILES.some(function(p) { return url.indexOf(p) !== -1; });
  if (isJsFile) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function(res) {
        if (res.ok) {
          // Clone SEBELUM return — iOS Safari throw "body already used" kalau clone setelah return
          var resClone = res.clone();
          caches.open(JS_CACHE).then(function(c) { c.put(e.request, resClone); });
        }
        return res;
      }).catch(function() {
        return caches.open(JS_CACHE).then(function(c) { return c.match(e.request); });
      })
    );
    return;
  }

  // Static assets (gambar, icon, manifest, wilayah-*.json) → cache-first
  e.respondWith(
    caches.open(CACHE_VERSION).then(function(c) {
      return c.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          if (res.ok) c.put(e.request, res.clone());
          return res;
        });
      });
    })
  );
});
