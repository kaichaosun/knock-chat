/**
 * One reader for every code the app can be handed.
 *
 * A link somebody sent, an id read out over the phone, an address pasted from
 * a wallet and a QR code held up to a camera are four ways of saying one of
 * two things: this room, or this person. Reading them in a single place is
 * what keeps the paste box, the URL the app was opened with and the scanner
 * from drifting into disagreeing about what a code means — and it makes a
 * fifth way of arriving cost a caller rather than a parser.
 *
 * The two shapes cannot be mistaken for each other. A room is a uuid, whose
 * dashes no address survives; a person is an address, whose `NQ` and checksum
 * no uuid carries.
 */

import { addressFrom } from "./address"
import { groupIdFrom } from "./group-link"

/** Where a code leads. */
export type Code =
  | { kind: "group"; id: string }
  | { kind: "peer"; address: string }

/**
 * Read whatever was pasted, scanned or opened, or `null` if it says neither
 * thing.
 *
 * Rooms are looked for first only because a uuid is the cheaper test; either
 * order gives the same answer, since no text can match both.
 */
export function readCode(text: string): Code | null {
  const id = groupIdFrom(text)
  if (id) return { kind: "group", id }

  const address = addressFrom(text)
  if (address) return { kind: "peer", address }

  return null
}

/**
 * A code in a link that leads back to this app, or `null` for one that leads
 * away.
 *
 * A room's invite link is an ordinary URL. It travels in a message like any
 * other and is drawn as a tappable link — and followed as one it reloads the
 * whole app to reach somewhere the app is already standing: a second tab in a
 * browser, and inside Nimiq Pay the Mini App torn down and started again, to
 * show a sheet that could have opened where it was.
 *
 * Only this app's own origin, and the origin is passed in rather than read from
 * the window so that what counts as "ours" is the caller's to state. A uuid in
 * somebody else's URL is somebody else's uuid, and a link that goes somewhere
 * has to be allowed to go there.
 */
export function ownCode(href: string, origin: string): Code | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  return url.origin === origin ? readCode(href) : null
}
