// Froq service worker — installability + web push for merchant approval alerts.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: "/froq-logo.png",
    badge: "/froq-logo.png",
    tag: data.tag || "froq-approval",
    renotify: true,
    data: { url: data.url || "/merchant" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/merchant";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/merchant") && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
