# Evaluating dmto-core as the base for the Nimiq mini app

Verified against `/Users/kaichaosun/github/dmto/dmto-core` @ `f3388a5` (branch `phase-0-ecash-core`).

## What exists — verified

~3,000 lines of Rust across three crates. `cargo test -p dmto-ecash`: **29 passed, 0 failed.**

| Phase | Status | What's in it |
| --- | --- | --- |
| 0 — ecash core | ✅ | BDHKE over secp256k1: `hash_to_curve`, blinding, blind signing with DLEQ proofs, unblinding, double-spend rejection, value-conserving swap. Typed errors, serde wire format, CI. |
| 1 — ecash as a service | ✅ | axum mint server; Postgres-persisted keyset, issuer keypair, spent-secret set, supply totals. `/v1/info`, `/v1/keyset`, `/v1/supply`, `/v1/mint`, `/v1/swap`, `/v1/melt`. CLI wallet that verifies DLEQ before accepting a signature. |
| 2 — multi-issuer economy | ✅ | Multi-issuer wallet accounts, user-chosen trust with per-issuer caps, relay-hosted cross-issuer exchange at posted rates (`/v1/rates`, `/v1/exchange`). |
| 3 — relay transport | ❌ | Not started. No envelope format, no routing, no store-and-forward. |
| 4 — anti-spam postage | ❌ | Not started. Designed in detail in SPEC §4.4–4.5, zero code. |
| 5 — delegation | ❌ | Not started. |
| 6 — messaging app | ❌ | Not started. No identity/addressing scheme. |

**The blunt read: the money layer is done, the messaging layer is zero.** For a messaging
competition entry that is the wrong half finished — except it is the *hard* half, and the
half no competitor can reproduce in four weeks.

Also missing for this specific target: any browser wallet (CLI only) and any Nimiq code.

## Why the fit is genuinely good, not just convenient

**1. Nimiq answers an open question you already wrote down.**
ROADMAP's open questions: *"Backing of ecash units (abstract units vs. Lightning/on-chain)
— currently abstract."* Nimiq is the answer, and a better one than Lightning for a small
mint: no channels, no liquidity management, no inbound-capacity problem. Mint ecash by
sending NIM, melt ecash back to NIM — a single `sendBasicTransaction`, ~1s finality,
~0.005 NIM in fees. Lightning makes a small mint operator's life miserable; Nimiq makes it
one call. This is not a hackathon bolt-on; it closes a real hole in the design.

**2. Ecash beats every architecture considered so far on the exact thing that sank them.**

| Approach | Metadata exposure |
| --- | --- |
| Messages on-chain | Who talked to whom, when, forever, publicly. Fatal. |
| Nostr + gift wrap | Much better, but relays still see traffic patterns and you trust their behaviour. |
| **Chaumian ecash** | The mint **cannot** link who paid whom. Blind signatures — a proof, not a policy. |

**3. SPEC §4.4 is already the paid-inbox design.** Two independent postage slots, any
issuer, allowlist exemptions, refund-on-accept. That is the anti-spam mechanism the
messaging concept needed, specified in more detail than a hackathon would ever produce.

**4. The builder story is the best available.** *"I'm building a decentralized messaging
network with ecash spam protection; Nimiq is the missing backing layer"* beats every
"I made an app for a hackathon" narrative in the field. Storytelling and community
engagement are separately scored, ~10 points.

## The risk, stated plainly

**Scope.** Phases 3, 4 and 6, plus a browser wallet, plus a Nimiq bridge, in four weeks —
with a ship deadline of end of Week 2 because unique-wallet count is what accrues during
the public Week 3 window. As stated, that is not realistic.

**Ecash UX is where "onboarding in under 60 seconds" goes to die.** A judge opens this on a
phone. They must never see the words note, issuer, keyset, denomination, or exchange rate.
"You have 50 NIM of postage credit" — never "you hold 6 notes from issuer 0x3f…". Being
ruthless here is not polish, it is a scored criterion.

## Recommended scope — the thin vertical slice

Every item advances the dmto roadmap, so competition work is not throwaway.

1. **Nimiq-backed mint** — extend the existing mint: `/v1/mint` issues against an observed
   incoming NIM transaction, `/v1/melt` pays out NIM. (Phase 1 extension; answers the open
   question.)
2. **Minimal store-and-forward relay** — Phase 3 cut to one relay, no federation.
3. **Recipient postage only** — half of Phase 4. Drop relay postage, delegation, refunds,
   and allowlists for v1.
4. **Browser wallet in TypeScript** — see below. This is the feasibility unlock.

Explicitly out of scope for the competition: federation, delegation (Phase 5), cross-issuer
exchange in the UI, relay postage.

## Key technical finding: do not compile dmto-ecash to WASM

`dmto-ecash` depends on `secp256k1 = "0.29"` — the Rust binding to the **C** libsecp256k1 —
and `rand = "0.8"`, which needs getrandom's `js` feature under wasm32. That is a fight with
no payoff, inside a WebView, on a deadline.

The wire format is already Cashu-shaped (`blinded_point`, `c_prime`, `dleq`, keyset id).
Reimplement the wallet side in TypeScript on **`@noble/curves`** (v2.3.0, audited, pure JS,
browser-safe): `hash_to_curve`, `B_ = Y + rG`, `C = C' − rK`, DLEQ verification. Roughly 200
lines. Rust stays on the server where it belongs; TypeScript runs in the browser.

**Worth deciding early:** `@cashu/cashu-ts` (v4.9.0) is a mature TS Cashu wallet. If the
mint were made Cashu-NUT-compatible, that library comes free — a large time saving plus
interop with the whole Cashu ecosystem. The cost is conforming to the NUTs, which do not
natively cover dmto's multi-issuer trust and exchange model. This is a real fork in the
road, not a detail.

## Scoring

| Concept | Design | Funct. | Useful | Mktg | Bonus | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Messaging on Nostr | 22 | 24 | 22 | 22 | 5 | 95 |
| **Messaging on dmto** | 21 | 21 | 24 | 19 | 5 | **90** |
| Perch | 22 | 23 | 19 | 24 | 5 | 93 |
| Naming service | 20 | 22 | 18 | 15 | 5 | 80 |

Highest ceiling of anything considered — best originality, best story, real privacy — and
the highest variance. The Nostr route scores better on expectation only because it is far
more likely to actually ship. The single variable that decides this is whether Phases 3
and 4 can be cut down to a demoable slice by the end of Week 2.

## Open questions for you

1. Cashu-NUT compatibility: adopt it for the free TS wallet, or keep design freedom?
2. Is the relay hosted by you for the competition, and is Postgres acceptable operational
   overhead during judging?
3. Does the mini app hold ecash notes in browser storage? Losing them loses money —
   what is the recovery story a judge will encounter?
