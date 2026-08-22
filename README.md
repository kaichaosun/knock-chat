# Knock

A Nimiq Pay Mini App for messaging between wallets, where spam is priced out
instead of guessed at.

> **Status.** Authenticated, end-to-end encrypted messages over
> [knock-relay](../knock-relay). No postage yet — see [Roadmap](#roadmap).

## Run it

Two processes. The relay first:

```sh
cd ../knock-relay
KNOCK_RELAY_MEMORY=1 cargo run     # no database needed
```

Then the app:

```sh
npm install
npm run dev                          # http://localhost:5175
```

Vite proxies `/api` to the relay, so the app and the relay share one origin —
the same URL works from a phone on the LAN as it does on the desktop. Point at a
deployed relay with `VITE_RELAY_URL`, or a relay on another port with
`RELAY_URL=http://127.0.0.1:3999 npm run dev`.

### Two identities, two tabs

Outside Nimiq Pay there is no wallet to talk to, so a dev identity stands in.
Add `?as=alice`, `?as=bob`, `?as=carol` or `?as=dave` to pick one, and open two
tabs to hold a real conversation without touching a phone. These are the
checksummed address vectors from the relay's test suite.

### On a phone

`npm run dev` binds all interfaces and prints a LAN address. Open the
mini-apps section of Nimiq Pay and enter `http://<your-ip>:5175`. The app
detects the injected provider and uses the real wallet address instead of a dev
identity.

## Reaching someone

You cannot write to a stranger. You **knock** — a message plus payment — and they accept or
they do not. Accepting opens a channel and everything after is free, in both directions,
forever. Declining or ignoring keeps the NIM.

That is why the cost sits on opening a channel rather than on each message: a per-message
toll would charge you to *answer* someone who had just paid for your attention.

## Chats and Contacts

Two tabs. **Chats** is recent activity, held on the device. **Contacts** is everyone you
have an open channel with, read from the relay.

They are deliberately different things. A channel is the durable record of who you can
write to; a chat is only a view of it. Clear site data or sign in on a second device and
your chats vanish while every channel is still open — Contacts is what makes those people
findable again.

**Closing a chat** (the ✕ in a conversation header) hides it from Chats. The channel stays
open, the messages stay on the device, and anything new brings the thread straight back —
closing is tidying, not deleting, and not a mute.

## Your profile

Tap your avatar in the header. It holds your address and **cost to knock** — both public,
which is what makes it a profile rather than settings: anyone can read either from the
relay.

Cost to knock is what a stranger pays to reach you — default 10 NIM, and you keep it whether or not you answer. Presets go down to
**Free** (0), which is the one to use while testing: it removes the payment step entirely
so knocks need no chain access.

Set it to 1 NIM to exercise the real payment path for a fraction of a cent.

## Device probes

Three questions block the next slices and none can be answered from a desktop browser.
Open the app in Nimiq Pay and reach the probes any of these ways — whether the host
preserves a query string is itself one of the open questions, so there is a route that
does not depend on the URL at all:

- `http://<ip>:5175/?probe=1`
- `http://<ip>:5175/#probe`
- `http://<ip>:5175/probe`
- **Tap the "Messages" title five times** — works no matter what the host does to the URL.


| Probe | Answers |
| --- | --- |
| Signature semantics | Does `sign()` sign the raw UTF-8 bytes or wrap them first? Does the returned public key derive to the wallet's own address? Are signatures deterministic? |
| Deeplink | Does `https://nimpay.app/miniapps/open/…` preserve a query string? Invite tokens depend on it. |
| Minimum amount | Is there a floor under transaction values that would break 10 NIM postage? Sends to your own address, so only the fee is spent. |

**Copy** puts the whole report on the clipboard so results can leave the phone.

`src/probe/` is throwaway — delete it once SPEC.md §11 is settled.

## Tests

```sh
npm test
```

Covers the message store's merge and cursor logic, and the Nimiq signed-message
construction — pinned to the same real-wallet vector as the relay, so the two sides
cannot drift apart.

## How it works

| Layer | What it does |
| --- | --- |
| `lib/wallet.ts` | Waits for Nimiq Pay to inject `window.nimiq` via `@nimiq/mini-app-sdk`; falls back to a dev identity outside it. A wallet here is **only a signer** — it carries no address, because `sign()` returns the public key and the address derives from that. Dev identities are **real Ed25519 keypairs** from fixed seeds, so they sign challenges for real and the relay needs no test-only bypass. |
| `lib/auth.ts` | Challenge, sign, verify. The challenge carries this device's encryption key, so one signature both proves identity and publishes the key. Caches the session so `sign()` prompts once per device, not once per request. |
| `lib/crypto.ts` | X25519 key agreement, HKDF-SHA256, XChaCha20-Poly1305. One conversation key per pair, derived independently by both sides. **No forward secrecy** — a device key opens that conversation's whole history. |
| `lib/keys.ts` | This device's keypair, and peer certificates — **verified here, not trusted from the relay**, which is the entire point of end-to-end encryption. |
| `lib/relay.ts` | Talks to the relay: send, fetch by cursor, ack. |
| `lib/postage.ts` | The commitment a payment carries, pinned to the same cross-language vector the relay checks. |
| `hooks/use-knocks.ts` | Knocking, and the knocks waiting for your answer. Pays first, then hands the relay the nonce that redeems it. |
| `lib/messages.ts` | Local history. The relay only holds mail *for* a recipient, so a sender never gets its own messages back — the client keeps the thread and merges incoming envelopes into it, deduplicating on the relay-assigned `id`. |
| `hooks/use-messages.ts` | Polls every 3s while the document is visible, sends optimistically, exposes conversations and threads. |

**History lives on the device.** Clearing site data clears the conversation.
That changes when encryption lands and the relay can retain ciphertext.

**The read cursor is opaque and validated server-side.** The client stores whatever the
relay last returned and hands it straight back — it never interprets it. If the relay was
rebuilt or restored, it notices its own cursor is stale and replays from the beginning
rather than returning nothing, and the stable per-message `id` makes that replay a no-op
for anything already held. The client has no reconcile logic at all.

## Design notes

The palette follows Nimiq's brand — navy `#1F2348` for ink, the signature
`#265DD7 → #0582CA` gradient for accent — so the app reads as part of Nimiq Pay
rather than a stranger hosted inside it.

Details that matter inside a WebView, and are easy to miss:

- `viewport-fit=cover` plus `env(safe-area-inset-*)` so the layout reaches under
  the notch without hiding behind it.
- Inputs are at least 16px, or iOS zooms the page on focus.
- The page itself never rubber-bands; only lists scroll.
- Opening a thread pushes a history entry, so the Android back gesture leaves
  the thread rather than the app.
- `crypto.randomUUID` and `navigator.clipboard` need a secure context, which
  `http://<lan-ip>` is not — both have fallbacks.
- Avatars are derived from the address, so nobody has to set a profile picture
  and a screen full of them still looks like one product.

On a desktop browser the app is held in a phone-width column; inside Nimiq Pay
that constraint is a no-op.

## Roadmap

1. **Encryption.** Bodies are plain text and readable by the relay. They become
   ciphertext under a per-conversation key.
3. **NIM postage.** Strangers attach a small refundable payment the relay
   verifies on-chain before accepting; contacts and stakers are exempt. See
   [SPAM-PROTECTION.md](./SPAM-PROTECTION.md) and
   [ARCHITECTURE.md](./ARCHITECTURE.md).
