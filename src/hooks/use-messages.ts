import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { compact } from "@/lib/address"
import { decryptBody, encryptBody } from "@/lib/crypto"
import { forgetPeerKey, keyForPeer } from "@/lib/keys"
import * as history from "@/lib/messages"
import type { Message, MessageStatus, OpenedEnvelope, Snapshot } from "@/lib/messages"
import { RelayError, ackMessages, fetchMessages, sendMessage } from "@/lib/relay"
import type { Envelope } from "@/lib/relay"

/** How often to ask the relay for new mail while the app is visible. */
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

  // The live poll, so a pull-to-refresh can run the same read rather than a
  // second one written to look like it. Null while there is nobody signed in.
  const polling = useRef<(() => Promise<void>) | null>(null)

  // Push wakes the service worker in the background; the page only polls while visible.
  useEffect(() => {
    if (!owner) return
    let cancelled = false
    // The furthest point this device has told the relay it can forget. Scoped
    // to the effect, so switching identity starts the accounting over.
    let acked: string | null = null

    const poll = async () => {
      if (document.hidden) return
      try {
        // What is already written down here, the relay can let go of.
        //
        // Deliberately at the start of the *next* read rather than at the end
        // of the one that fetched it: this cursor has been through `update`,
        // and therefore through storage. Acking what has only just arrived
        // would risk deleting it from the relay in the moment it exists
        // nowhere else. A failed ack is not retried here — the next poll
        // carries the same cursor, or a later one, and deleting through a
        // point twice does nothing the first time did not.
        const settled = snapshotRef.current.cursor
        if (settled && settled !== acked) {
          void ackMessages(owner, settled)
            .then(() => {
              acked = settled
            })
            .catch(() => {})
        }

        // The cursor goes back exactly as it arrived. If it is stale — the
        // relay was rebuilt, or restored to an earlier point — the relay
        // notices and replays from the beginning, and the stable message ids
        // make the replay a no-op for anything already held.
        const result = await fetchMessages(owner, settled)
        if (cancelled) return
        setRelayStatus("online")

        // Decrypt before merging, so local history stays plain and the store
        // stays a pure function of what it is given.
        const opened = deviceSecretKey
          ? await openAll(result.messages, owner, deviceSecretKey)
          : result.messages
        if (cancelled) return

        update((current) => history.mergeIncoming(current, opened, result.next, owner))
      } catch (error) {
        if (cancelled) return
        if (error instanceof RelayError && error.status === 401) {
          onUnauthorized?.()
          return
        }
        setRelayStatus(error instanceof RelayError && error.status === 0 ? "offline" : "online")
      }
    }

    polling.current = poll
    void poll()
    let timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden) void poll()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      polling.current = null
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [owner, update, onUnauthorized, deviceSecretKey])

  /** Read now, for a gesture that asks for it. */
  const refresh = useCallback(async () => {
    await polling.current?.()
  }, [])

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
        // 402 means the door is shut, not that the network hiccuped.
        const shut = error instanceof RelayError && error.status === 402
        update((current) =>
          history.setStatus(current, message.id, shut ? "blocked" : "failed"),
        )
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
      update((current) => history.resend(current, message.id))
      try {
        const key = await keyForPeer(message.peer, deviceSecretKey)
        await sendMessage(owner, message.peer, encryptBody(message.body, key, owner, message.peer))
        update((current) => history.setStatus(current, message.id, "sent"))
      } catch (error) {
        const shut = error instanceof RelayError && error.status === 402
        update((current) =>
          history.setStatus(current, message.id, shut ? "blocked" : "failed"),
        )
        throw error
      }
    },
    [owner, deviceSecretKey, update],
  )

  const markRead = useCallback(
    (peer: string) => update((current) => history.markRead(current, peer)),
    [update],
  )

  const deleteThread = useCallback(
    (peer: string) => update((current) => history.deleteThread(current, peer)),
    [update],
  )

  /**
   * Settle a message this hook did not send itself.
   *
   * `send` owns the whole life of a direct message, but a room's messages go
   * out through `useGroups` — so writing one down and learning what became of
   * it happen in different places. This is the second half.
   */
  const setStatus = useCallback(
    (id: string, status: MessageStatus) =>
      update((current) => history.setStatus(current, id, status)),
    [update],
  )

  /**
   * Take the name the relay gave a message this device sent.
   *
   * Only rooms need it. A room's history returns everything said in it, this
   * device's words included, and a message still under its local id would come
   * back unrecognised and land a second time. A direct message is never handed
   * back — the relay holds one copy, addressed to the recipient — so its local
   * id is the only id it will ever need.
   */
  const settle = useCallback(
    (id: string, name: string) => update((current) => history.settle(current, id, name)),
    [update],
  )

  /** Put a message back on its way, timed for when it is actually resent. */
  const resend = useCallback(
    (id: string) => update((current) => history.resend(current, id)),
    [update],
  )

  /**
   * Fold a room's past into the history, leaving the feed's cursor alone.
   *
   * The same merge the feed uses — keyed on message id, so anything already
   * here is not added twice — but the cursor is passed back unchanged. That
   * cursor is the feed's position, and a room's past is not the feed: moving it
   * to a `seq` from before the room was joined would tell the relay this device
   * is behind and replay everything since.
   *
   * Room bodies are plain text, so there is nothing to decrypt on the way in.
   */
  const absorbHistory = useCallback(
    (envelopes: Envelope[]) => {
      // Bound before the closure: nothing arrives for a device with nobody
      // signed in, and the merge needs to know whose words are whose.
      const mine = owner
      if (!mine) return
      update((current) => history.mergeIncoming(current, envelopes, current.cursor, mine))
    },
    [update, owner],
  )

  /** Record a message this device sent outside the normal send path — a knock. */
  const recordOutgoing = useCallback(
    (peer: string, body: string, id: string, group?: string, status?: MessageStatus) =>
      update((current) => history.recordOutgoing(current, peer, body, id, group, status)),
    [update],
  )

  const conversations = useMemo(() => history.conversations(snapshot), [snapshot])
  // Exposed so the caller can fold in rooms without resurrecting the ones whose
  // chat was deleted — this hook knows nothing about rooms.
  const dismissed = snapshot.dismissed
  const threadWith = useCallback(
    (peer: string) => history.threadWith(snapshot, peer),
    [snapshot],
  )

  return {
    conversations,
    threadWith,
    send,
    retry,
    markRead,
    deleteThread,
    dismissed,
    recordOutgoing,
    absorbHistory,
    settle,
    setStatus,
    resend,
    relayStatus,
    refresh,
  }
}

/**
 * Decrypt a page of envelopes, one conversation key per sender.
 *
 * Anything that will not open is kept and flagged rather than dropped: a
 * message this device cannot read is still evidence that someone wrote, and
 * silently discarding it would leave an unexplained gap.
 *
 * Room messages are passed through untouched, because they are not encrypted
 * at all.
 */
async function openAll(
  envelopes: Envelope[],
  owner: string,
  deviceSecretKey: Uint8Array,
): Promise<OpenedEnvelope[]> {
  const keys = new Map<string, Uint8Array | null>()
  // Peers whose certificate has already been re-fetched in this pass, so a
  // thread full of genuinely unreadable messages asks once rather than once
  // per message.
  const refreshed = new Set<string>()
  const opened: OpenedEnvelope[] = []

  for (const envelope of envelopes) {
    // A room's messages are plain text and were never sealed. Handing one to
    // the decrypter would fail and file it as unreadable, hiding what it
    // plainly says — see `group.rs` on the relay for why they are not
    // encrypted in this version.
    if (envelope.group_id) {
      opened.push({ ...envelope })
      continue
    }

    const peer = compact(envelope.from)
    if (!keys.has(peer)) {
      keys.set(
        peer,
        await keyForPeer(envelope.from, deviceSecretKey).catch(() => null),
      )
    }

    const key = keys.get(peer) ?? null
    let plaintext = key ? decryptBody(envelope.body, key, envelope.from, owner) : null

    // Failing to open it does not mean it cannot be opened. The sender may
    // have signed in on another device since this key was cached, in which
    // case the message is perfectly readable with their new certificate and
    // only the cache makes it look broken. Worth one fetch to find out —
    // marking it unreadable is permanent, and this is the last chance to be
    // sure before that.
    if (plaintext === null && !refreshed.has(peer)) {
      refreshed.add(peer)
      forgetPeerKey(envelope.from)
      const fresh = await keyForPeer(envelope.from, deviceSecretKey).catch(() => null)
      keys.set(peer, fresh)
      plaintext = fresh ? decryptBody(envelope.body, fresh, envelope.from, owner) : null
    }

    opened.push(
      plaintext === null
        ? { ...envelope, body: "", undecryptable: true }
        : { ...envelope, body: plaintext },
    )
  }
  return opened
}
