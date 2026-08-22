# Concept shortlist — scored against the Cycle II rubric

Scores are my honest estimate out of each category's max (25/25/25/25/5 = 105).
They are relative, not absolute — the point is the shape of each concept's weakness.

| # | Concept | Design | Funct. | Useful | Mktg | Bonus | Total | Fatal risk |
|---|---------|--------|--------|--------|------|-------|-------|------------|
| 1 | **Perch** — attention market, previous holder gets paid | 22 | 23 | 19 | 24 | 5 | **93** | reads as a gimmick |
| 2 | Pledge — staked habit commitments | 21 | 22 | 22 | 17 | 5 | 87 | loop outlasts the contest |
| 3 | Receipts — proof-carrying payments | 19 | 22 | 20 | 15 | 4 | 80 | adjacent to saturated |
| 4 | IOU — signed promises, netted, P2P settled | 19 | 21 | 20 | 15 | 4 | 79 | saturated category |
| 5 | Daily — skill challenge, on-chain scores | 21 | 17 | 20 | 20 | 3 | 81 | payment isn't core |
| 6 | Ticket — signed attestations for events | 19 | 21 | 22 | 11 | 4 | 77 | cold start impossible |

---

## 1. Perch — *recommended*

> **"Claim your spot. When someone takes it, they pay you."**

A mobile grid of spots. Each spot holds one person: their handle, a short message, a link.
Tap a spot to see who holds it, tip them, or take it.

- **Claiming a free spot costs nothing** — just a near-zero-fee data transaction. Onboarding
  is under 60 seconds and financially risk-free, which is exactly what maximises the
  "unique wallets that interacted" criterion.
- **Taking an occupied spot pays its current holder directly, wallet to wallet.** Price steps
  up on each takeover. No custody, no escrow, no backend holding anyone's money.
- The message lives in the transaction's 2112-byte recipient data field. State is
  reconstructed by reading the chain, so the board is verifiable and survives the app.

**Why it wins on the rubric**

- *Unique wallets* — the strongest of any concept here. Every holder actively promotes their
  own spot because they want it seen, so users market the app on the app's behalf. The board
  is its own advertisement.
- *Nimiq integration* — every single interaction is a NIM transaction. Nothing is bolted on.
- *Repeat value* — you come back to check whether you've been taken, and to take it back.
  The loop closes in seconds, not weeks.
- *Bonus* — entirely NIM-denominated.
- *Ecosystem value* — drives real on-chain NIM volume and showcases the data field.

**The timing insight.** Around 60 other builders are in this cycle and every one of them needs
distribution during the same three weeks. A board where you pay to promote your mini app —
and the person you displaced gets paid — is infrastructure for the competition itself. That is
a real, acute need in exactly the right community at exactly the right moment, and it doubles
as a genuine reason to show up in the community, which is separately scored.

**Honest weakness.** "Does this address a real need?" is the softest axis. Mitigation: frame it
as a community directory first and an attention market second, so the wall is useful to browse
even if you never claim anything. Note that Cycle 1's winner was also a social sandbox rather
than a utility, so this shape demonstrably scores well with these judges.

**Not gambling.** Every price is deterministic and known before you pay. There is no wager and
no randomness — it is a purchase at a posted price.

---

## 2. Pledge — staked habit commitments

Stake NIM natively, commit to a goal with friends, check in daily.

Strong on originality (the staking suite is the single most underused primitive) and on the
bonus, and the pitch is excellent: *earn real staking yield while you build a habit*.

**Why it is not the recommendation:** a habit challenge worth doing runs 21–30 days, which is
longer than the scoring window. Judges would never see the loop close, and the unstaking
cooldown makes it worse. There is also an unverified risk that the minimum delegation amount
is high enough to deter casual testers — which would gut the unique-wallets score. Both
problems are structural, not fixable with better execution.

Worth revisiting for Cycle III in October, where the timing would actually work.

---

## 3. Receipts — proof-carrying payments

Zero backend; every payment carries structured data and both sides get a permanent,
unforgeable receipt reconstructed from the chain alone.

Architecturally the most elegant, and the strongest "no backend at all" story. But it sits next
door to Cycle 1's saturated zone (Nimiq Invoice Pay, PayShare, TrustPay, Nimble) and its growth
loop is transactional rather than viral — you only meet a new wallet when you happen to trade
with one.

---

## 4. IOU — signed promises, netted and settled

Exchange gasless signed IOUs during the week; the app nets everything down to the minimal set
of transfers and each person signs their own settlement.

The signed-state-channel angle is genuinely novel and the honest answer to the no-escrow
constraint. But "splitting the bill" was the single most crowded category in Cycle 1 and
judges will pattern-match it in the first three seconds, before the novelty registers.

---

## 5. Daily — skill challenge with on-chain scores

One shared puzzle a day, one attempt per device via `requestDeviceIdentifier`, scores signed
and posted on-chain, leaderboard rebuilt from the chain.

Maximal repeat value and a proven Wordle-style share loop with zero cold start. Fails on the
explicitly scored *"does it use wallets, transactions, or payments as a **core** part of the
experience?"* — in a free daily puzzle, payment is decoration. Fixing that means adding
wagering, which runs into the games-of-chance rule.

---

## 6. Ticket — signed attestations for events

Pay the organiser directly, receive a wallet-signed ticket, get scanned at the door.

Real utility and a clean no-custody design. But it needs actual events with actual attendees
inside a three-week window, and that cold start cannot be solved by building better software.

---

## The cross-cutting constraint

Every concept above is designed so the app never holds anyone's money, because the provider
cannot do it. Concepts that need escrow — pooled prizes, refundable deposits, conditional
release, group pots — are unbuildable honestly on this framework. That constraint is not a
limitation to work around; it is the single best source of differentiation available, because
most competitors will either fake it or quietly go custodial.
