# Architecture — dmto relay + Nimiq, no Nostr, no ecash

Supersedes the Nostr transport in [SPAM-PROTECTION.md](./SPAM-PROTECTION.md). The postage
economics there are unchanged; only the transport and identity layers change.

## The identity insight

Nimiq signs with **Ed25519**. Nostr uses **secp256k1**. That mismatch forced a derivation
hack — sign a domain-separated string with the wallet, hash the signature, seed a
secp256k1 key — which depended on `sign()` being deterministic. That was the largest
unverified risk in the whole design.

Running our own relay removes it, because identity and encryption can be separated:

| Role | Key | How it works |
| --- | --- | --- |
| **Identity** | the Nimiq wallet key (Ed25519) | Relay sends a challenge, client calls `nimiq.sign(challenge)`, relay verifies the signature and derives the Nimiq address from the returned `publicKey`. **The Nimiq address is the account.** |
| **Encryption** | an X25519 keypair generated in-app | Published once as a statement signed by the wallet key: *"my encryption key is X"*. Anyone can verify the binding. |

The provider gives a signing oracle, not a private key, so ECDH is impossible with the
wallet key on *any* curve — that was never a secp256k1 problem. The fix is the standard
identity-key-certifies-subkey pattern (PGP subkeys, Signal prekeys), and it needs **no
determinism at all**. Losing the device means re-keying, which is normal and expected.

**Consequences:** no derived identity, no binding transaction required at onboarding, and
risk #1 is retired outright. Onboarding becomes one signature prompt and zero transactions
— which matters, because "zero to using it in under 60 seconds" is a scored criterion.

## What controlling the relay buys

**1. Spam is rejected before it is stored.** This is the substantive win. With Nostr, relays
know nothing about NIM, so they accept everything and the client filters after download —
the spam still arrives. Our relay verifies postage on-chain *before* accepting an envelope
and answers `402 Payment Required` otherwise. Spam never reaches the recipient's device.

**2. Server-side chain verification.** The relay runs a Nimiq client and watches the chain.
The browser doesn't have to ship `@nimiq/core` WASM just to verify postage, which removes
the bundle-size problem flagged against the 60-second onboarding criterion. A recipient who
wants to verify independently still can.

**3. SPEC §4.4's two postage slots become implementable.** Recipient postage *and* relay
postage. Only the recipient slot ships in v1; the relay slot is the natural v2.

**4. It advances dmto Phases 3 and 4.** Competition work is not throwaway — same argument
as the ecash version, at a small fraction of the scope.

## What it costs

**1. Phase 3 must be built.** Nostr gave store-and-forward for free. Now it's an axum
service over the existing Postgres setup: envelopes keyed by recipient pubkey, fetch, ack,
retention. The Phase 1–2 server skeleton, migrations and API patterns already exist, so
this is a few hundred lines, not a rewrite.

**2. No battle-tested spec.** NIP-44 and NIP-17 are reviewed and have known-answer tests.
**Do not invent crypto here.** Use the standard construction — X25519 ECDH → HKDF →
XChaCha20-Poly1305 (`@noble/curves` + `@noble/ciphers` in TS, `x25519-dalek` +
`chacha20poly1305` in Rust) — or reimplement NIP-44's documented construction without the
rest of Nostr.

**3. Sealed sender must be designed in, not bolted on.** NIP-59 gift wrap hid sender and
recipient from relays for free. A naive envelope means our relay sees the full social
graph. Encrypt the recipient handle to the relay separately from the payload, or accept
and disclose it. Decide this before writing the envelope format.

**4. "Decentralized" is a roadmap claim, not a shipped fact.** One relay, run by us, during
judging. State that plainly in the submission — judges respect an honest limitation more
than an overclaim.

## Message flow

**Onboarding** — one signature, no transaction:
1. Relay issues a challenge; client calls `nimiq.sign(challenge)`.
2. Relay verifies and derives the Nimiq address from the returned public key.
3. Client generates an X25519 keypair, publishes it signed by the wallet key.
4. Session token cached, so `sign()` prompts happen once per device, not per request.

**Stranger → recipient:**
1. Alice fetches Bob's postage policy from the relay.
2. Alice sends postage on Nimiq:
   `sendBasicTransactionWithData({ recipient: NQ_Bob, value: policy.amount, data: "nimp"|nonce })`
3. Alice POSTs the envelope `{ ciphertext, nonce, tx_hash }`.
4. Relay verifies on-chain: confirmed, value ≥ policy, recipient = Bob, data carries the
   nonce, nonce unused. Marks the nonce consumed.
5. Accept and store — or `402 Payment Required`.
6. Bob fetches and decrypts. Nimiq Pay's own payment notification already told him it
   arrived.
7. Bob taps **not spam** → one-tap refund and permanent allowlist.

**Contact → recipient:** allowlisted, free, no postage, no transaction.

**Staker → recipient:** relay checks `getStaker(address)` server-side; free within a daily
rate cap.

## Optional: on-chain identity anchor

Keep the binding transaction from [SPAM-PROTECTION.md](./SPAM-PROTECTION.md) as an opt-in
**anchor my identity** action rather than an onboarding step. It buys relay independence —
your identity survives us disappearing — at the cost of one transaction. Making it optional
keeps onboarding instant while preserving the censorship-resistance story for the demo.

## Net effect on scope versus the Nostr plan

| Added | Removed |
| --- | --- |
| Relay store-and-forward (Phase 3) | `nostr-tools` integration |
| Relay-side postage verification | Deterministic key-derivation scheme |
| Envelope format + sealed sender | Mandatory on-chain binding transaction |
| | Gift-wrap handling |

Roughly a wash on effort, with a materially cleaner design, full control of the postage
mechanism, and the largest technical risk eliminated.
