// public/sw.js — Service Worker
const CACHE_VERSION = 'kh-v28';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const API_CACHE   = `${CACHE_VERSION}-api`;

const PRECACHE_SHELL = [
  '/',
  '/pages/home.html',
  '/pages/courses.html',
  '/pages/ai-tutor.html',
  '/pages/offline-library.html',
  '/pages/download-center.html',
  '/pages/dashboard.html',
  '/pages/quizzes.html',
  '/pages/help.html',
  '/pages/admin.html',
  '/pages/subjects.html',
  '/pages/progress.html',
  '/pages/coding-lab.html',
  '/pages/local-classroom.html',
  '/pages/classroom.html'
];

const PRECACHE_ASSETS = [
  '/css/main.css',
  '/css/home.css',
  '/css/courses.css',
  '/css/tutor.css',
  '/css/library.css',
  '/css/dashboard.css',
  '/css/download.css',
  '/css/quiz.css',
  '/css/voice.css',
  '/css/admin.css',
  '/js/app.js',
  '/js/offline-db.js',
  '/js/connectivity.js',
  '/js/voice.js',
  '/js/library.js',
  '/js/tutor.js',
  '/js/download.js',
  '/js/quiz-runner.js',
  '/js/dashboard.js',
  '/js/admin.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-512.png'
];

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(ASSET_CACHE);
      await Promise.allSettled(PRECACHE_SHELL.map((url) => shell.add(url).catch(() => {})));
      await Promise.allSettled(PRECACHE_ASSETS.map((url) => assets.add(url).catch(() => {})));
      self.skipWaiting();
    })()
  );
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  // API: network-first
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET') {
      event.respondWith(networkFirst(req, API_CACHE));
    }
    // POST/PATCH/DELETE pass through to network (KH_SYNC handles retries)
    return;
  }

  // HTML pages: shell-with-background-revalidation
  if (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(shellStrategy(req));
    return;
  }

  // Static assets: cache-first
  if (req.method === 'GET' && isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
});

// ---------- Strategies ----------
async function shellStrategy(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const networkRes = await networkPromise;
  if (networkRes) return networkRes;
  return offlineFallback();
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return offlineFallback();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({
      error: 'Offline',
      code: 'OFFLINE',
      message: 'This request could not be completed offline.'
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function offlineFallback() {
  const cache = await caches.open(SHELL_CACHE);
  const home = (await cache.match('/pages/home.html')) || (await cache.match('/'));
  if (home) return home;
  return new Response(
    '<!DOCTYPE html><html><head><title>Offline</title></head><body style="font-family:system-ui;text-align:center;padding:4rem"><h1>You are offline</h1><p>Open the app while connected once to cache it.</p></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

// ---------- Helpers ----------
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/') ||
    pathname.startsWith('/assets/') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname === '/manifest.json'
  );
}

// ---------- Message channel ----------
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'skip-waiting') self.skipWaiting();
  if (data.type === 'clear-caches') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});