# NIM as spam protection

Design for the messaging mini app. Transport is Nostr; NIM does the anti-spam and the
identity anchor. No ecash.

## Why NIM specifically

Postage-based anti-spam has been proposed for decades and never shipped, because the
transaction fee always dwarfed the postage. The ratio that matters is **fee ÷ postage**.

At NIM = $0.00039198 (checked 2026-08-22) and a ~0.005 NIM fee for a short data transaction:

| Postage | USD | 1,000 messages | 1,000,000 messages | Fee as % of postage |
| ---: | ---: | ---: | ---: | ---: |
| 10 NIM | $0.0039 | $3.92 | $3,920 | 0.0500% |
| 25 NIM | $0.0098 | $9.80 | $9,800 | 0.0200% |
| **100 NIM** | **$0.0392** | **$39.20** | **$39,198** | **0.0050%** |
| 250 NIM | $0.0980 | $98.00 | $97,995 | 0.0020% |

**100 NIM is the sweet spot.** Four cents to reach a stranger — refundable, so a legitimate
sender pays nothing in practice. A million spam messages costs $39,198, which ends bulk
spam as a business. And the network fee is 0.005% of the postage, so the mechanism costs
essentially nothing to operate.

On Ethereum the same 4-cent postage would carry a gas fee 10–50× larger than the postage
itself. That inversion is why nobody has shipped this. Nimiq's near-zero fees plus ~1s
finality are what make micro-postage viable — this is a genuinely Nimiq-shaped problem.

## Four tiers

### Tier 0 — identity binding (on-chain, once, permanent)

The only thing that belongs on-chain forever. One transaction from the user's Nimiq
address whose data field carries:

```
"nim1" | nostr_pubkey (32 B) | sig_by_nostr_key_over_nimiq_address (64 B)   = 100 bytes
```

This proves control in **both** directions: the Nimiq key authorised the transaction, and
the Nostr key signed the Nimiq address. Cost ~0.005 NIM, paid once, ever.

Anyone replaying that address's history can build a verifiable `NQ address ↔ npub`
directory with no server and no registry operator. This is also what makes the app a real
Nimiq application rather than a Nostr client with a wallet attached.

The Nostr key itself is derived deterministically from a Nimiq wallet signature over a
domain-separated string, so it survives reinstalls. **Verify on a real device first** —
see Risks.

### Tier 1 — contacts are free, forever

Reciprocity: if you have ever replied to someone, or refunded their postage, they are
allowlisted permanently. Real relationships never pay. This is what keeps the mechanism
from being felt by actual users.

### Tier 2 — stakers get a free, rate-limited lane

A sender who holds an active NIM stake sends free, capped at N messages per day.

`getStaker(address)` and `getStakers([…])` are readable for **any** address directly from
the browser, so the recipient's client verifies this trustlessly with no payment involved.

Why this tier is worth having:

- **It leaks nothing.** Proving "I am a staker with ≥ X NIM" is a claim about account
  state, not a payment to the recipient. Unlike postage, it creates no on-chain link
  between sender and recipient.
- **It costs the sender nothing.** Stake is self-custodial and earns validator yield. It is
  a bond, not a fee.
- **Sybil resistance is structural.** A thousand identities require a thousand stakes, each
  locked behind an unstaking cooldown.

It is sybil-resistant but not volume-limiting on its own — one wealthy staker could send
freely — hence the daily rate cap, with postage required beyond it.

### Tier 3 — strangers pay refundable postage

1. Alice reads Bob's policy (a Nostr replaceable event: amount, address, exemptions).
2. Alice picks a random 32-byte nonce and sends postage:
   `sendBasicTransactionWithData({ recipient: NQ_Bob, value: policy.amount, data: "nimp"|nonce })`
3. Alice sends the gift-wrapped Nostr DM containing the nonce and the transaction hash.
4. Bob's client verifies against **his own incoming transactions** — he never needs a
   general transaction lookup, just a watch on his own address: a transaction exists
   carrying that nonce, value ≥ policy, sender = Alice's bound address.
5. Valid → inbox. Missing or invalid → filtered.
6. Bob taps **not spam** → one-tap refund, and Alice is allowlisted forever (Tier 1).

**Anti-replay:** the nonce is single-use. Bob keeps a consumed-nonce set, so one payment
can never cover two messages.

**Anti-forgery:** the payment must actually exist on-chain, paying Bob. Nothing to spoof.

## The notification property

Nimiq Pay 2.14.0 notifies on incoming payments, and the mini-app SDK has no notification
API at all. So money attached is the only push channel available — and the tiers line up
with it naturally:

| Sender | Cost | Notification |
| --- | --- | --- |
| Stranger | postage | Nimiq Pay push fires |
| Contact | free | silent, fetched on open |
| Contact who wants to interrupt you | attaches dust | push fires |

Notification urgency ends up correlated with money attached, which is the correct
incentive and required no extra machinery.

## Honest weaknesses

- **Postage is a public payment, so first contact leaks metadata.** Alice→Bob is visible
  on-chain for stranger messages. Contact messages are free and therefore leak nothing, and
  the staker lane leaks nothing, but first contact is public. This is the price of dropping
  ecash, which solved it with blind signatures. It should be stated in the UI, not buried.
- **It stops bulk spam, not a determined individual.** Someone willing to pay four cents
  can send one abusive message. Block and report are still required; this is an economic
  filter, not a moral one.
- **Refunds are voluntary.** Mitigate by auto-refunding on reply and making refund rate
  visible on a profile.
- **NIM is volatile.** Postage fixed in NIM drifts in real value. Either peg the policy to a
  USD figure and convert at send time, or prompt recipients to revisit it.
- **Chain reads add weight.** The `@nimiq/core` WASM client is the trustless option and
  needs a bundle-size check against the under-60-second onboarding criterion.

## Risks to retire in the first two days

1. **Is Nimiq Pay's `sign()` deterministic?** Ed25519 is deterministic per RFC 8032, but if
   the wallet adds a nonce or prefix, key derivation breaks. Fallback: generate the Nostr
   key in-app, store locally, publish the pubkey on-chain — at the cost of losing history
   if the device is lost. **Test this before anything else is built.**
2. **Is there a minimum transaction amount in Nimiq Pay** that would make 100 NIM postage
   or dust pings impossible?
3. **Does `@nimiq/core` load acceptably inside the Nimiq Pay WebView**, and how large is it?
