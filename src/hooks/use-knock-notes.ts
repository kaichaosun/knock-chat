import { useEffect, useState } from "react"

import { decryptBody } from "@/lib/crypto"
import { forgetPeerKey, keyForPeer } from "@/lib/keys"
import type { Knock } from "@/lib/relay"

/**
 * What each waiting knock says, by knock id.
 *
 * `null` for one this device cannot open; absent for one not read yet.
 */
export type KnockNotes = Record<string, string | null>

/**
 * Open the messages on knocks that have not been answered yet.
 *
 * A knock is sealed to this device exactly like a message — the relay carries
 * the ciphertext and can no more read it than it can read anything else — so
 * the only thing standing between the recipient and the words is that nobody
 * had asked yet. Reading them costs nothing and lets nobody in: the channel is
 * still shut, and stays shut until the door is opened.
 *
 * Which is the whole point of paying to knock. What is bought is the chance to
 * say who you are; a door answered without hearing that is answered blind.
 */
export function useKnockNotes(
  knocks: Knock[],
  owner: string | null,
  deviceSecretKey: Uint8Array | null,
): KnockNotes {
  const [notes, setNotes] = useState<KnockNotes>({})

  // Which knocks are waiting, as one value to watch. Bodies never change under
  // a knock, so nothing else about the list is worth re-reading for — and the
  // poll behind it returns an equal-but-new array every fifteen seconds.
  const waiting = knocks.map((knock) => knock.id).join(",")

  useEffect(() => {
    if (!owner || !deviceSecretKey) return
    let cancelled = false

    void (async () => {
      const opened: KnockNotes = {}
      for (const knock of knocks) {
        opened[knock.id] = await openNote(knock, owner, deviceSecretKey)
      }
      // Replaced in one go rather than as each lands, so a card never flickers
      // from nothing to something while its neighbour is still being read.
      if (!cancelled) setNotes(opened)
    })()

    return () => {
      cancelled = true
    }
    // `knocks` is what `waiting` stands for; watching the array itself would
    // re-read every poll.
  }, [waiting, owner, deviceSecretKey])

  return notes
}

async function openNote(
  knock: Knock,
  owner: string,
  deviceSecretKey: Uint8Array,
): Promise<string | null> {
  const key = await keyForPeer(knock.from, deviceSecretKey).catch(() => null)
  const text = key ? decryptBody(knock.body, key, knock.from, owner) : null
  if (text !== null || key === null) return text

  // A cached certificate can be older than the knock sealed against its
  // replacement, which reads as an unopenable message and is not one. Worth a
  // single fetch to be sure, on the same reasoning as opening an envelope.
  forgetPeerKey(knock.from)
  const fresh = await keyForPeer(knock.from, deviceSecretKey).catch(() => null)
  return fresh ? decryptBody(knock.body, fresh, knock.from, owner) : null
}
