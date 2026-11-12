/* Service worker do MilhasX: recebe o push e abre o app ao tocar na notificação. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MilhasX", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MilhasX";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || "/app/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === url.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url.href);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});

/* Navegador trocou o endereço de push: avisa o servidor com o novo. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const sub = event.newSubscription || (await self.registration.pushManager.getSubscription());
      if (!sub) return;
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(sub.toJSON()) });
    })(),
  );
});
