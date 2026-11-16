// Service worker: app shell offline (cache-first).
// WAJIB: naikkan CACHE_NAME setiap rilis, samakan dengan APP_VERSION di js/version.js.
const CACHE_NAME = 'belajar-v9';

// Semua path RELATIF terhadap lokasi sw.js (= docs/), supaya jalan di sub-path GitHub Pages.
const ASSETS = [
  './',
  'index.html',
  'hanzi.html',
  'lesson.html',
  'math.html',
  'mathq.html',
  'cards.html',
  'fill.html',
  'listen.html',
  'order.html',
  'write.html',
  'tone.html',
  'manifest.json',
  'css/style.css',
  'js/boot.js',
  'js/cards.js',
  'js/errors.js',
  'js/fill.js',
  'js/hanzi.js',
  'js/home.js',
  'js/inkpad.js',
  'js/leitner.js',
  'js/lesson.js',
  'js/lessonpage.js',
  'js/lessons.js',
  'js/listen.js',
  'js/order.js',
  'js/math.js',
  'js/mathhints.js',
  'js/mathlogic.js',
  'js/mathq.js',
  'js/pinyin.js',
  'js/speech.js',
  'js/storage.js',
  'js/tone.js',
  'js/tones.js',
  'js/ui.js',
  'js/version.js',
  'js/write.js',
  'js/writing.js',
  'content/hsk2/lessons.json',
  'content/hsk2/vocab.json',
  'content/math/syllabus.json',
  'vendor/hanzi-writer/hanzi-writer.esm.js',
  'vendor/hanzi-writer/LICENSE.txt',
  'vendor/hanzi-writer-data/chars.json',
  'vendor/hanzi-writer-data/ARPHICPL.TXT',
  'vendor/hanzi-writer-data/COPYING.md',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Tidak skipWaiting otomatis: versi baru menunggu sampai anak mengetuk banner update.
  // cache: 'reload' = selalu ambil dari server, jangan dari cache HTTP browser/CDN. GitHub Pages
  // menyimpan file sampai 10 menit; tanpa ini versi baru bisa terpasang dengan file lama.
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('belajar-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (e) {
        // Offline dan belum di-cache: untuk navigasi, tampilkan menu utama.
        if (req.mode === 'navigate') {
          const home = await cache.match('index.html');
          if (home) return home;
        }
        throw e;
      }
    }),
  );
});
