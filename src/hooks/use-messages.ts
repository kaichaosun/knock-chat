import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { compact } from "@/lib/address"
import * as history from "@/lib/messages"
import type { Message, Snapshot } from "@/lib/messages"
import { RelayError, fetchMessages, sendMessage } from "@/lib/relay"

/** How often to ask the relay for new mail while the app is in the foreground. */
const POLL_INTERVAL_MS = 3000

export type RelayStatus = "connecting" | "online" | "offline"

/**
 * Owns the conversation history for `owner`: polls the relay, merges what
 * arrives into local storage, and sends optimistically so the composer never
 * feels like it is waiting on the network.
 */
export function useMessages(owner: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    owner ? history.load(owner) : { cursor: 0, messages: [], readAt: {} },
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
    const loaded = owner ? history.load(owner) : { cursor: 0, messages: [], readAt: {} }
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
        const result = await fetchMessages(owner, snapshotRef.current.cursor)
        if (cancelled) return
        setRelayStatus("online")
        if (result.messages.length > 0) {
          update((current) => history.mergeIncoming(current, result.messages))
        }
      } catch (error) {
        if (cancelled) return
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
  }, [owner, update])

  const send = useCallback(
    async (peer: string, body: string) => {
      if (!owner) return
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
        await sendMessage(owner, peer, body)
        update((current) => history.setStatus(current, message.id, "sent"))
        setRelayStatus("online")
      } catch (error) {
        update((current) => history.setStatus(current, message.id, "failed"))
        if (error instanceof RelayError && error.status === 0) setRelayStatus("offline")
        throw error
      }
    },
    [owner, update],
  )

  const retry = useCallback(
    async (message: Message) => {
      if (!owner) return
      update((current) => history.setStatus(current, message.id, "sending"))
      try {
        await sendMessage(owner, message.peer, message.body)
        update((current) => history.setStatus(current, message.id, "sent"))
      } catch (error) {
        update((current) => history.setStatus(current, message.id, "failed"))
        throw error
      }
    },
    [owner, update],
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
