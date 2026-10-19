// Cache somente da interface. Dados financeiros e autenticação NUNCA são cacheados pelo service worker.
const CACHE='financeflow-shell-v2';
const ASSETS=['/','/index.html','/app.js','/style.css','/config.js','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(response=>{if(response.ok&&ASSETS.includes(new URL(req.url).pathname)){
 const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}
 return response;
 }).catch(()=>caches.match(req)));
});
