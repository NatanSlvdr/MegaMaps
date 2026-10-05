import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const paths = (await files("dist")).filter((p) => !p.endsWith("/sw.js"));
const hash = createHash("sha256");
for (const path of paths.sort()) hash.update(await readFile(path));
const cacheName = `map-viewer-shell-${hash.digest("hex").slice(0, 16)}`;
const urls = paths.map((p) => `/${p.slice(5)}`);
await writeFile(
  "dist/sw.js",
  `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('map-viewer-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'verify-shell' || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const missing = [];
      for (const url of ASSETS) {
        const response = await cache.match(url);
        if (!response || !(await response.arrayBuffer()).byteLength) missing.push(url);
      }
      event.ports[0].postMessage({ ready: missing.length === 0, missing, assets: ASSETS.length });
    } catch { event.ports[0].postMessage({ ready: false, missing: ['Application shell'] }); }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html')).then(response => response || fetch(request)));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(request)));
  }
});
`,
);
console.log(`Offline shell: ${urls.length} assets, ${cacheName}`);
