import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { compact } from "@/lib/address"
import { decryptBody, encryptBody } from "@/lib/crypto"
import { keyForPeer } from "@/lib/keys"
import * as history from "@/lib/messages"
import type { Message, OpenedEnvelope, Snapshot } from "@/lib/messages"
import { RelayError, fetchMessages, sendMessage } from "@/lib/relay"
import type { Envelope } from "@/lib/relay"

/** How often to ask the relay for new mail while the app is in the foreground. */
const POLL_INTERVAL_MS = 3000

export type RelayStatus = "connecting" | "online" | "offline"

/**
 * Owns the conversation history for `owner`: polls the relay, merges what
 * arrives into local storage, and sends optimistically so the composer never
 * feels like it is waiting on the network.
 */
export function useMessages(
  owner: string | null,
  deviceSecretKey: Uint8Array | null,
  onUnauthorized?: () => void,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    owner ? history.load(owner) : history.emptySnapshot(),
  )
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("connecting")

  // Kept in a ref so the polling effect doesn't restart on every message.
  const snapshotRef = useRef(snapshot)
  const update = useCallback(
    (change: (current: Snapshot) => Snapshot) => {
      setSnapshot((current) => {
        const next = change(current)
        snapshotRef.current = next
        if (owner) history.save(owner, next)
        return next
      })
    },
    [owner],
  )

  // Swap histories when the identity changes (dev identity switch).
  useEffect(() => {
    const loaded = owner ? history.load(owner) : history.emptySnapshot()
    snapshotRef.current = loaded
    setSnapshot(loaded)
  }, [owner])

  // Poll while the document is visible; a hidden WebView should not keep asking.
  useEffect(() => {
    if (!owner) return
    let cancelled = false

    const poll = async () => {
      if (document.hidden) return
      try {
        // The cursor goes back exactly as it arrived. If it is stale — the
        // relay was rebuilt, or restored to an earlier point — the relay
        // notices and replays from the beginning, and the stable message ids
        // make the replay a no-op for anything already held.
        const result = await fetchMessages(owner, snapshotRef.current.cursor)
        if (cancelled) return
        setRelayStatus("online")

        // Decrypt before merging, so local history stays plain and the store
        // stays a pure function of what it is given.
        const opened = deviceSecretKey
          ? await openAll(result.messages, owner, deviceSecretKey)
          : result.messages
        if (cancelled) return

        update((current) => history.mergeIncoming(current, opened, result.next))
      } catch (error) {
        if (cancelled) return
        if (error instanceof RelayError && error.status === 401) {
          onUnauthorized?.()
          return
        }
        setRelayStatus(error instanceof RelayError && error.status === 0 ? "offline" : "online")
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    const onVisible = () => void poll()
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [owner, update, onUnauthorized, deviceSecretKey])

  const send = useCallback(
    async (peer: string, body: string) => {
      if (!owner || !deviceSecretKey) return

      // Resolve the recipient's key first: if they have never signed in there
      // is nothing to encrypt to, and the message must not be queued as if it
      // were on its way.
      const key = await keyForPeer(peer, deviceSecretKey)

      const message: Message = {
        id: `local:${history.messageId()}`,
        peer: compact(peer),
        direction: "out",
        body,
        at: new Date().toISOString(),
        status: "sending",
      }
      update((current) => history.appendOutgoing(current, message))

      try {
        await sendMessage(owner, peer, encryptBody(body, key, owner, peer))
        update((current) => history.setStatus(current, message.id, "sent"))
        setRelayStatus("online")
      } catch (error) {
        update((current) => history.setStatus(current, message.id, "failed"))
        if (error instanceof RelayError) {
          if (error.status === 0) setRelayStatus("offline")
          if (error.status === 401) onUnauthorized?.()
        }
        throw error
      }
    },
    [owner, deviceSecretKey, update, onUnauthorized],
  )

  const retry = useCallback(
    async (message: Message) => {
      if (!owner || !deviceSecretKey) return
      update((current) => history.setStatus(current, message.id, "sending"))
      try {
        const key = await keyForPeer(message.peer, deviceSecretKey)
        await sendMessage(owner, message.peer, encryptBody(message.body, key, owner, message.peer))
        update((current) => history.setStatus(current, message.id, "sent"))
      } catch (error) {
        update((current) => history.setStatus(current, message.id, "failed"))
        throw error
      }
    },
    [owner, deviceSecretKey, update],
  )

  const markRead = useCallback(
    (peer: string) => update((current) => history.markRead(current, peer)),
    [update],
  )

  const conversations = useMemo(() => history.conversations(snapshot), [snapshot])
  const threadWith = useCallback(
    (peer: string) => history.threadWith(snapshot, peer),
    [snapshot],
  )

  return { conversations, threadWith, send, retry, markRead, relayStatus }
}

/**
 * Decrypt a page of envelopes, one conversation key per sender.
 *
 * Anything that will not open is kept and flagged rather than dropped: a
 * message this device cannot read is still evidence that someone wrote, and
 * silently discarding it would leave an unexplained gap.
 */
async function openAll(
  envelopes: Envelope[],
  owner: string,
  deviceSecretKey: Uint8Array,
): Promise<OpenedEnvelope[]> {
  const keys = new Map<string, Uint8Array | null>()
  const opened: OpenedEnvelope[] = []

  for (const envelope of envelopes) {
    const peer = compact(envelope.from)
    if (!keys.has(peer)) {
      keys.set(
        peer,
        await keyForPeer(envelope.from, deviceSecretKey).catch(() => null),
      )
    }

    const key = keys.get(peer) ?? null
    const plaintext = key ? decryptBody(envelope.body, key, envelope.from, owner) : null
    opened.push(
      plaintext === null
        ? { ...envelope, body: "", undecryptable: true }
        : { ...envelope, body: plaintext },
    )
  }
  return opened
}
