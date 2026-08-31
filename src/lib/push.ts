import { request } from "@/lib/relay"

function bytes(key: string) {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}

/** Register this device with the relay.  The relay owns delivery, not a tab timer. */
export async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
  const registration = await navigator.serviceWorker.register("/push-sw.js")
  const { public_key } = await request<{ public_key: string | null }>("/v1/push/config")
  if (!public_key) return
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes(public_key),
  })
  await request("/v1/push/subscription", {
    method: "PUT",
    body: JSON.stringify(subscription.toJSON()),
  })
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await request("/v1/push/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}
