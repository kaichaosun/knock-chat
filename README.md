# Knock

A Nimiq Pay Mini App for messaging between wallets, where spam is priced out
instead of guessed at.

> **Status: first slice.** Plain-text messages over
> [knock-relay](../knock-relay). No authentication, no encryption, no
> postage yet — see [Roadmap](#roadmap).

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

## Device probes

Three questions block the next slices and none can be answered from a desktop browser.
Open the app in Nimiq Pay at `?probe=1` to run them:

| Probe | Answers |
| --- | --- |
| Signature semantics | Does `sign()` sign the raw UTF-8 bytes or wrap them first? Does the returned public key derive to the wallet's own address? Are signatures deterministic? |
| Deeplink | Does `https://nimpay.app/miniapps/open/…` preserve a query string? Invite tokens depend on it. |
| Minimum amount | Is there a floor under transaction values that would break 10 NIM postage? Sends to your own address, so only the fee is spent. |

**Copy** puts the whole report on the clipboard so results can leave the phone.

`src/probe/` is throwaway — delete it once SPEC.md §11 is settled.

## How it works

| Layer | What it does |
| --- | --- |
| `lib/wallet.ts` | Waits for Nimiq Pay to inject `window.nimiq` via `@nimiq/mini-app-sdk`; falls back to a dev identity outside it. |
| `lib/relay.ts` | Talks to the relay: send, fetch by cursor, ack. |
| `lib/messages.ts` | Local history. The relay only holds mail *for* a recipient, so a sender never gets its own messages back — the client keeps the thread and merges incoming envelopes into it. |
| `hooks/use-messages.ts` | Polls every 3s while the document is visible, sends optimistically, exposes conversations and threads. |

**History lives on the device.** Clearing site data clears the conversation.
That changes when encryption lands and the relay can retain ciphertext.

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

1. **Authentication.** The relay serves any address's queue to anyone who asks.
   Fetches get gated on an Ed25519 challenge signed by the wallet, with the
   caller's address derived from the returned public key.
2. **Encryption.** Bodies are plain text and readable by the relay. They become
   ciphertext under a per-conversation key.
3. **NIM postage.** Strangers attach a small refundable payment the relay
   verifies on-chain before accepting; contacts and stakers are exempt. See
   [SPAM-PROTECTION.md](./SPAM-PROTECTION.md) and
   [ARCHITECTURE.md](./ARCHITECTURE.md).
