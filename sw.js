// オフライン用のサービスワーカー。
//
// 自分のファイル（このフォルダの中）だけを network-first で扱う（つながっていれば常に最新、圏外なら保存しておいた版）。
// 外のもの（フォントなど）は使わない。写真は通信しないので、キャッシュにも入らない。
//
// 注意: キャッシュ（CacheStorage）は t-of.github.io のすべてのアプリで共有されている。
// 古いキャッシュを消すときは、必ず自分の PREFIX で始まるものだけを消す。
// keys.filter(k => k !== CACHE) のように書くと、ほかのアプリのキャッシュまで消してしまう。

const PREFIX = 'kagamigami-';
const VERSION = 'v1';
const CACHE = `${PREFIX}${VERSION}`;
const SCOPE = new URL('./', self.location).href;

const SHELL = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './strips.js',
  './sample.js',
  './sound.js',
  './manifest.webmanifest',
  './webapp-kit/webapp-kit.css',
  './webapp-kit/webapp-kit.js',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
      .map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}
