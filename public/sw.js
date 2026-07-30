// Froq service worker — installability + web push for merchant approval alerts.
// Intentionally does NOT cache app HTML/JS. Caching Next/Turbopack chunks causes
// "module factory is not available" after deploys or HMR.

const SW_VERSION = "froq-sw-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("froq-")).map((k) => caches.delete(k))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("froq-") && k !== SW_VERSION)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Pass-through only — required for beforeinstallprompt / installability.
// Never call respondWith for /_next or documents so the browser always gets
// fresh modules after a deploy.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/_next/") || event.request.mode === "navigate") {
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Froq", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "New stamp request";
  const options = {
    body: data.body || "A customer is waiting for approval.",
    icon: "/froq-mark-192.png",
    badge: "/froq-mark-192.png",
    tag: data.tag || "froq-approval",
    renotify: true,
    data: { url: data.url || "/merchant?tab=approvals" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/merchant?tab=approvals";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/merchant") && "focus" in client) {
          client.postMessage({ type: "froq:navigate", url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
