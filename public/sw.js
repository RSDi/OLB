// Service worker for the installed portal app: shows push notifications
// (lib/notifications/push.ts) and opens the page they point at when tapped.
// No fetch handler and no caching, so pages always come fresh from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "OLB - Portal";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/portal" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/portal", self.location.origin);
  // Only ever open pages on this site.
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === url.origin && "focus" in w);
      if (open) {
        return open.focus().then((w) => (w && "navigate" in w ? w.navigate(url.href) : w));
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
