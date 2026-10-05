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
const urls = paths.map((p) => `/${p.slice(5)}`);
// Hosts with pretty URLs (Cloudflare assets, Netlify…) redirect /index.html to /.
// Safari refuses to open a page from a service-worker response that was
// redirected, so the shell is fetched from / and every cached response is
// stored as a fresh, redirect-free copy.
const worker = `
const SHELL = '/index.html';
const source = url => url === SHELL ? '/' : url;
async function clean(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch everything before writing anything, so installation stays atomic.
    const responses = await Promise.all(ASSETS.map(async url => {
      const response = await fetch(source(url), { cache: 'reload' });
      if (!response.ok) throw new Error('Could not cache ' + url + ': ' + response.status);
      return [url, await clean(response)];
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
    // Take over immediately: a broken older worker must not keep serving pages.
    await self.skipWaiting();
  })());
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
    event.respondWith(caches.open(CACHE).then(cache => cache.match(SHELL)).then(response => response ? clean(response) : fetch(request)));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(request)));
  }
});
`;
const hash = createHash("sha256").update(worker);
for (const path of paths.sort()) hash.update(await readFile(path));
const cacheName = `map-viewer-shell-${hash.digest("hex").slice(0, 16)}`;
await writeFile(
  "dist/sw.js",
  `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(urls)};${worker}`,
);
console.log(`Offline shell: ${urls.length} assets, ${cacheName}`);
