// e-IRF Service Worker — Offline Support + Background Sync
const CACHE_NAME = 'eirf-v2';
const API_CACHE_NAME = 'eirf-api-v2';
const SYNC_TAG = 'eirf-sync';
const DB_NAME = 'eirf-queue';
// Bumped 1 -> 2 to add the REJECTED_STORE (see below). onupgradeneeded
// creates any store that doesn't exist yet, so this is safe for both a
// fresh install and an existing v1 database.
const DB_VERSION = 3;
const STORE_NAME = 'mutations';
// Items that got a definitive "no" from the server (4xx other than 401)
// land here instead of being silently retried forever — see B2 in the
// audit. They need a human to look at them (edit and resubmit, or
// discard), not another automatic retry.
const REJECTED_STORE = 'rejected';
const SETTINGS_STORE = 'settings';
const ACTIVE_OFFICER_KEY = 'active-officer-id';

// How long a cached API GET response (incident details, witness statements,
// dashboard data, ...) is allowed to keep serving from Cache Storage before
// being treated as expired. This is real case data sitting unencrypted on
// the device — bounding its lifetime limits exposure on a lost, stolen, or
// shared device, on top of clearing it outright on logout (see the
// CLEAR_API_CACHE message handler below).
const API_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CACHED_AT_HEADER = 'sw-cached-at';

// ─── API cache helpers (with expiry) ───────────────────────────────────────

async function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, Date.now().toString());
  const timestamped = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return cache.put(request, timestamped);
}

async function matchFreshApiCache(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);
  if (!cached) return undefined;
  const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER) || 0);
  if (!cachedAt || Date.now() - cachedAt > API_CACHE_TTL_MS) {
    await cache.delete(request);
    return undefined;
  }
  return cached;
}

async function purgeExpiredApiCache() {
  const cache = await caches.open(API_CACHE_NAME);
  const requests = await cache.keys();
  await Promise.all(
    requests.map(async (request) => {
      const cached = await cache.match(request);
      const cachedAt = Number(cached?.headers.get(CACHED_AT_HEADER) || 0);
      if (!cachedAt || Date.now() - cachedAt > API_CACHE_TTL_MS) {
        await cache.delete(request);
      }
    }),
  );
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(REJECTED_STORE)) {
        db.createObjectStore(REJECTED_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function storeAdd(storeName, entry) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).add(entry);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function storeGetAll(storeName) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function storeGet(storeName, id) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function storeDelete(storeName, id) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function storeClear(storeName) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function settingGet(key) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function settingSet(key, value) {
  return openQueueDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SETTINGS_STORE, 'readwrite');
        value == null
          ? tx.objectStore(SETTINGS_STORE).delete(key)
          : tx.objectStore(SETTINGS_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function enqueue(entry) {
  return storeAdd(STORE_NAME, entry);
}

async function dequeueAll() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();
    getReq.onsuccess = () => {
      const items = getReq.result;
      store.clear();
      tx.oncomplete = () => resolve(items);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

// ─── Install / Activate ───────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/', '/manifest.json']).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      ),
      // The previous cleanup only dropped whole caches by stale version
      // name — same-version entries persisted indefinitely regardless of
      // age. Sweep for individually-expired entries every activation too.
      purgeExpiredApiCache(),
    ])
  );
  self.clients.claim();
});

// Messages from the page. CLEAR_API_CACHE existed before (logout); the
// rest are new — see B2/U7 in the audit.
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE_NAME));
    return;
  }

  if (type === 'SET_ACTIVE_OFFICER') {
    event.waitUntil(settingSet(ACTIVE_OFFICER_KEY, Number(event.data.officerId)));
    return;
  }

  if (type === 'ACTIVATE_OFFICER_AND_RETRY') {
    event.waitUntil((async () => {
      await settingSet(ACTIVE_OFFICER_KEY, Number(event.data.officerId));
      await replayQueue();
    })());
    return;
  }

  if (type === 'CLEAR_USER_DATA') {
    event.waitUntil(Promise.all([
      caches.delete(API_CACHE_NAME),
      settingSet(ACTIVE_OFFICER_KEY, null),
    ]));
    return;
  }

  // The officer just logged back in after a session-expired sync failure —
  // don't wait for the next connectivity-change event, try replaying now.
  if (type === 'RETRY_SYNC') {
    event.waitUntil(replayQueue());
    return;
  }

  // Let the offline banner show what's actually queued/rejected instead of
  // just a bare count (U7 in the audit).
  if (type === 'GET_QUEUE_STATUS') {
    event.waitUntil(
      (async () => {
        const [activeOfficerId, allQueued, allRejected] = await Promise.all([
          settingGet(ACTIVE_OFFICER_KEY),
          storeGetAll(STORE_NAME),
          storeGetAll(REJECTED_STORE),
        ]);
        const queued = allQueued.filter((item) => item.officerId === activeOfficerId);
        const rejected = allRejected.filter((item) => item.officerId === activeOfficerId);
        notifyClients({
          type: 'QUEUE_STATUS',
          queued: queued.map(summarizeEntry),
          rejected: rejected.map(summarizeEntry),
        });
      })(),
    );
    return;
  }

  // Officer chose to give up on a still-queued or rejected item.
  if (type === 'DISCARD_ITEM') {
    const store = event.data.store === 'rejected' ? REJECTED_STORE : STORE_NAME;
    event.waitUntil(
      (async () => {
        const [activeOfficerId, item] = await Promise.all([
          settingGet(ACTIVE_OFFICER_KEY),
          storeGet(store, event.data.id),
        ]);
        if (!item || item.officerId !== activeOfficerId) return;
        await storeDelete(store, event.data.id);
        const [allQueued, allRejected] = await Promise.all([
          storeGetAll(STORE_NAME),
          storeGetAll(REJECTED_STORE),
        ]);
        const queued = allQueued.filter((entry) => entry.officerId === activeOfficerId);
        const rejected = allRejected.filter((entry) => entry.officerId === activeOfficerId);
        notifyClients({
          type: 'QUEUE_STATUS',
          queued: queued.map(summarizeEntry),
          rejected: rejected.map(summarizeEntry),
        });
      })(),
    );
    return;
  }

  // Officer wants to try a rejected item again (e.g. after fixing the
  // underlying data some other way) — move it back into the live queue.
  if (type === 'RETRY_ITEM') {
    event.waitUntil(
      (async () => {
        const activeOfficerId = await settingGet(ACTIVE_OFFICER_KEY);
        const rejected = (await storeGetAll(REJECTED_STORE))
          .filter((entry) => entry.officerId === activeOfficerId);
        const item = rejected.find((r) => r.id === event.data.id);
        if (!item) return;
        await storeDelete(REJECTED_STORE, item.id);
        const { id, ...withoutId } = item;
        await enqueue(withoutId);
        await replayQueue();
      })(),
    );
    return;
  }
});

function summarizeEntry(entry) {
  // Never send the raw body/headers to the client — it may contain witness
  // statements or other case data, and the banner only needs to describe
  // the action, not its full contents.
  let label = `${entry.method} ${new URL(entry.url).pathname}`;
  return {
    id: entry.id,
    label,
    timestamp: entry.timestamp,
    rejectionReason: entry.rejectionReason,
  };
}

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  const items = await dequeueAll();
  if (!items.length) return;
  const activeOfficerId = await settingGet(ACTIVE_OFFICER_KEY);

  let replayed = 0;
  let authExpiredCount = 0;
  const requeue = []; // transient failures — network unreachable, or 5xx: try again next time
  const rejected = []; // permanent failures — 4xx other than 401: won't succeed by retrying

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!activeOfficerId || item.officerId !== activeOfficerId) {
      requeue.push(item);
      continue;
    }
    try {
      const resp = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
        credentials: 'include',
      });

      if (resp.ok) {
        replayed++;
      } else if (resp.status === 401) {
        // Session expired while offline. Retrying this exact request will
        // never succeed until the officer logs back in, so don't spin on
        // it — keep it queued (the work itself is still valid and
        // shouldn't be lost) and tell the officer plainly what's needed,
        // instead of leaving them looking at a "queued" count that will
        // never resolve on its own. See B2 in the audit.
        authExpiredCount++;
        requeue.push(item);
      } else if (resp.status >= 400 && resp.status < 500) {
        // A definitive rejection (validation error, forbidden, not found,
        // conflict, ...) — retrying the identical request will keep
        // failing the identical way. Move it out of the auto-retry queue
        // so it stops masquerading as "will sync eventually", and surface
        // it for a human decision instead.
        let reason = `Rejected by server (HTTP ${resp.status})`;
        try {
          const body = await resp.clone().json();
          if (body?.error) reason = body.error;
        } catch {}
        rejected.push({ ...item, rejectionReason: reason });
      } else {
        // 5xx — could well be transient (deploy in progress, DB hiccup).
        requeue.push(item);
      }
    } catch {
      // Genuine network error — still offline. Re-queue this and
      // everything after it in original order and stop trying for now.
      requeue.push(item, ...items.slice(i + 1));
      break;
    }
  }

  for (const item of requeue) {
    await enqueue(item);
  }
  for (const item of rejected) {
    await storeAdd(REJECTED_STORE, item);
  }

  const pending = (await storeGetAll(STORE_NAME))
    .filter((item) => item.officerId === activeOfficerId).length;

  if (replayed > 0) {
    notifyClients({ type: 'SYNC_COMPLETE', replayed, pending });
  }
  if (authExpiredCount > 0) {
    notifyClients({ type: 'SYNC_AUTH_EXPIRED', pending: authExpiredCount });
  }
  if (rejected.length > 0) {
    notifyClients({ type: 'SYNC_ITEMS_REJECTED', count: rejected.length });
  }
}

// ─── Fetch handler ───────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http and cross-origin requests
  if (!url.protocol.startsWith('http')) return;
  if (url.origin !== self.location.origin) return;

  // ── Mutating API requests (POST / PATCH / PUT / DELETE) ──────────────────
  // Try network; if offline, queue for background sync and return 202.
  if (request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          // Authentication operations must never be deferred: replaying a
          // logout or login under a later user's cookie can switch identity
          // in the middle of a queue replay.
          if (url.pathname.startsWith('/api/auth/')) {
            return new Response(
              JSON.stringify({ error: 'Authentication requires a network connection' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          const officerId = await settingGet(ACTIVE_OFFICER_KEY);
          if (!officerId) {
            return new Response(
              JSON.stringify({ error: 'Cannot save offline work without an identified officer' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          // Offline — save to IDB queue
          const body = await request.clone().text();
          const entry = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(
              [...request.headers.entries()].filter(([k]) =>
                ['content-type', 'accept'].includes(k)
              )
            ),
            body,
            officerId,
            timestamp: Date.now(),
          };
          await enqueue(entry);

          // Register background sync (Chrome/Edge). Falls back silently elsewhere.
          try {
            await self.registration.sync.register(SYNC_TAG);
          } catch {}

          const pending = (await storeGetAll(STORE_NAME))
            .filter((item) => item.officerId === officerId).length;
          // Notify clients about the queued count
          await notifyClients({ type: 'QUEUED', pending });

          return new Response(
            JSON.stringify({ queued: true, message: 'Saved offline — will sync when reconnected' }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      })()
    );
    return;
  }

  // ── Read API requests: network-first, fallback to cache ─────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request.clone())
        .then((response) => {
          if (response.ok) {
            caches.open(API_CACHE_NAME).then((cache) =>
              putWithTimestamp(cache, request, response.clone())
            );
          }
          return response;
        })
        .catch(() => matchFreshApiCache(request))
    );
    return;
  }

  // ── Static assets: cache-first ───────────────────────────────────────────
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── HTML / navigation: network-first, fallback to cached root ───────────
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // ── Default: network with cache fallback ─────────────────────────────────
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
