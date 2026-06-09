const OPS_SW_VERSION = "v533-final-ops-ai-calendar-inventory";
const STATIC_CACHE = `dashboard-ops-static-${OPS_SW_VERSION}`;
const DATA_CACHE = `dashboard-ops-data-${OPS_SW_VERSION}`;

const STATIC_ASSETS = [
  "./",
  "index.html",
  "offline.html",
  "manifest.json?v=73",
  "styles.css?v=532",
  "v5-ui.css?v=100",
  "v5-1-ui.css?v=101",
  "v5-2-ui.css?v=108",
  "v5-3-restaurant.css?v=110",
  "complaints-dashboard-v112.css?v=114",
  "ops-performance-v509.css?v=509",
  "ops-readability-v510.css?v=510",
  "app.js?v=513",
  "tools-hub.js?v=59",
  "tools-config.json",
  "complaints-isolated-v31.js?v=99",
  "complaints-dashboard-v112.js?v=509",
  "executive-dashboard.js?v=76",
  "premium-reports.js?v=532",
  "ops-intelligence.js?v=509",
  "src/config/aiConfig.js?v=522",
  "src/services/aiProvider.js?v=532",
  "aiProvider.js?v=532",
  "ops-ai-access.js?v=532",
  "ops-ai-director.js?v=509",
  "ops-ai-assistant.js?v=522",
  "restaurant-profile-v53.js?v=111",
  "ops-enterprise-surfaces.js?v=109",
  "admin-center-v513.js?v=516",
  "ops-auth.js?v=526",
  "inventory-utils.js?v=98",
  "inventory-calculations.js?v=532",
  "inventory-orders.js?v=511",
  "inventory-imports.js?v=98",
  "inventory-supabase.js?v=98",
  "inventory-render.js?v=532",
  "inventory-command.js?v=532",
  "inventory-data.json?v=86",
  "pwa.js?v=84",
  "ops-readability-v510.js?v=510",
  "salvatore-logo.jpg",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "apple-touch-icon.png",
  "apple-touch-icon-salvatore-v73.png",
  "icons/icon-192-salvatore-v73.png",
  "icons/icon-512-salvatore-v73.png",
  "icons/icon-maskable-512-salvatore-v73.png",
  "icons/apple-touch-icon-salvatore-v73.png",
  "icons/splash-1170x2532.png",
  "icons/splash-1290x2796.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("dashboard-ops-") && ![STATIC_CACHE, DATA_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});

function isCsvRequest(request){
  const url = new URL(request.url);
  return url.hostname.includes("docs.google.com") ||
    url.searchParams.get("output") === "csv" ||
    url.pathname.toLowerCase().endsWith(".csv");
}

function isStaticAsset(request){
  if(request.method !== "GET") return false;
  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return false;
  return /\.(?:html|css|js|json|mjs|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname === "/" ||
    url.pathname.endsWith("/");
}

function isFreshStaticAsset(request){
  const url = new URL(request.url);
  return /\.(?:html|css|js|mjs)$/i.test(url.pathname);
}

async function networkFirst(request){
  const cache = await caches.open(DATA_CACHE);
  try{
    const response = await fetch(request);
    if(response && response.ok){
      cache.put(request, response.clone());
    }
    return response;
  }catch(error){
    const cached = await cache.match(request);
    if(cached) return cached;
    throw error;
  }
}

async function cacheFirst(request){
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request) || await cache.match(new URL(request.url).pathname.slice(1));
  if(cached) return cached;
  const response = await fetch(request);
  if(response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if(request.method !== "GET") return;

  if(isCsvRequest(request)){
    event.respondWith(networkFirst(request));
    return;
  }

  if(request.mode === "navigate"){
    event.respondWith((async () => {
      try{
        const response = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put("index.html", response.clone());
        return response;
      }catch(error){
        return (await caches.match("index.html")) || (await caches.match("offline.html"));
      }
    })());
    return;
  }

  if(isFreshStaticAsset(request)){
    event.respondWith(networkFirst(request));
    return;
  }

  if(isStaticAsset(request)){
    event.respondWith(cacheFirst(request));
  }
});
