/* The worker, rather than the page, survives while a tab is asleep. */
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Always produce a visible notification. Chrome otherwise adds its own
    // generic “site updated in the background” notification for this event.
  }
  event.waitUntil(self.registration.showNotification(data.title || "New message", {
    body: data.body || "Open Knock to read it.",
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: data.tag || "knock:message",
  }))
})
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) =>
    windows[0] ? windows[0].focus() : clients.openWindow("/"),
  ))
})
