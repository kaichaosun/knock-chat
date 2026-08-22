# Nimiq Mini Apps Competition — Cycle II research

## Timeline
- **Competition: Aug 24 – Sep 18, 2026** (4 weeks)
- Weekly community calls: Tuesdays 1:00–2:30 PM EST (Aug 26, Sep 2, 9, 16)
- Submissions go public in **Week 3** for community testing
- Cycle III: Oct 5–30

## Prizes (Cycle II — $17,000 USDT)
| Place | Amount |
| --- | --- |
| 1st | $10,000 |
| 2nd | $5,000 |
| 3rd | $2,000 |

Paid in USDT to a Nimiq wallet. Awarded per team, not per person.

## Scoring — 105 points, judged by the Nimiq Community Council
Scale per criterion: Outstanding 5 / Strong 4 / Competent 3 / Developing 2 / Insufficient 1 / Not demonstrated 0.

### Design & UX — 25
- **First impression** — does it look professional and trustworthy at first glance?
- **Visual design** — are colors, typography, layout clean and consistent?
- **Navigation** — can a new user figure it out without instructions?
- **Mobile experience** — does it feel native and responsive on a phone?
- **Onboarding** — zero to using it in under 60 seconds?

### Functionality — 25
- **Core feature** — does the main function work reliably?
- **Nimiq integration** — wallets/transactions/payments as a *core* part of the experience
- **Speed and performance** — loads fast, responds without lag
- **Error handling** — fails gracefully instead of crashing
- **Completeness** — finished product, not half-built prototype

### Usefulness & originality — 25
- **Problem solved** — addresses a real need or want?
- **Target audience** — clear who it's for?
- **Originality** — fresh idea or meaningful improvement on something existing?
- **Repeat value** — would someone open it more than once?
- **Ecosystem value** — does it make Nimiq Pay more useful/attractive to new users?

### Marketing & distribution — 25
- **Unique users** — *how many distinct Nimiq wallets interacted with the Mini App during the scoring period*
- **User acquisition effort** — did the builder actively promote it beyond submitting?
- **Content and storytelling** — build log, demo video, compelling story
- **Community engagement** — calls, progress sharing, helping others
- **Submission quality** — app-store ready, clear description, polished visuals, tempting demo

### Bonus — 5
- **NIM usage** — does the submission incentivize the usage of NIM?

> Site's own warning: *"Don't just build. Ship something polished, tell the story of what you built, get real people to use it, and show up in the community. Builders who treat this as 'build and forget' will score lower."*

## Hard rules
- MIT license, public GitHub repo, all code open source
- Must support USDT, NIM, or both — **displaying a logo is not integration**
- Must be finished and usable on the first try, not a prototype
- Max 250-word description; demo video optional but scored
- **Prohibited: gambling, betting, games of chance decided primarily by randomness** (skill-based games are allowed)
- No hardcoded credentials/private keys/API secrets
- 18+, teams up to 5, one submission per team per cycle

## Submission format
Repo `nimiq/miniappscompetition-submissions`, one directory per builder containing:
`submission.yaml`, `README.md`, `icon.png`, `thumbnail.jpg`, `screenshot-1..3.jpg`

`submission.yaml` fields: `app_name, category, tagline, description, pricing, repo_url,
demo_url, video_url, contact_email, team_name, team_members, x_account, builder_story,
icon, thumbnail, screenshots, github_login, submitted_at`

Categories: Games, Social, Earning, Marketplaces, Productivity, Creator & Media,
Education, Health & Fitness, Food & Dining, Shop & Deals, Lifestyle

## Technical surface — `@nimiq/mini-app-sdk` v0.1.0 (MIT)

```bash
npm install @nimiq/mini-app-sdk
```
```ts
import { init, getHostLanguage, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'
const nimiq = await init({ timeout: 10_000 })   // waits for window.nimiq injection
```

### `window.nimiq` (NimiqProvider)
| Method | Notes |
| --- | --- |
| `listAccounts()` | `string[]` of NQ addresses |
| `sign(message)` | → `{ publicKey, signature }` — off-chain attestations, gasless |
| `isConsensusEstablished()` | boolean |
| `getBlockNumber()` | current height |
| `sendBasicTransaction({recipient, value, fee?, validityStartHeight?})` | value in **Lunas** (1 NIM = 1e5) |
| `sendBasicTransactionWithData({..., data})` | **arbitrary data attached on-chain** |
| `sendNewStakerTransaction({delegation, value})` | delegate to a validator |
| `sendStakeTransaction({value})` | add to existing stake |
| `sendSetActiveStakeTransaction({newActiveBalance})` | |
| `sendUpdateStakerTransaction({newDelegation, reactivateAllStake?})` | |
| `sendRetireStakeTransaction({retireStake})` | |
| `sendRemoveStakeTransaction({value})` | unstake |
| `setRPCUrl()` / `getRPC()` | direct Nimiq RPC for reads (`TransactionInfo`) |

### `window.ethereum` — standard EIP-1193
Ethereum, Arbitrum One, Optimism, Base, BNB Smart Chain, Sepolia. ERC-20 incl. **USDT on Polygon**.
`eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `eth_blockNumber`, `eth_gasPrice`,
`personal_sign`, `eth_sign`, `eth_getBalance`.

### `window.nimiqPay` (host context)
- `language` — ISO 639-1, seeded before page script runs. Fall back to `navigator.language`.
- `requestDeviceIdentifier({ reason })` — 64-char hex SHA-256, **per-origin**, stable across
  reinstalls and user accounts. Identifies the *device*, not the user. Anti-sybil / leaderboards.
  Not for authentication.

### Deeplinks (the share vector)
- `nimiqpay://miniapp?url=your-app.com`
- `https://nimpay.app/miniapps/open/your-app.com`

### Local dev
`npm run dev` on `0.0.0.0`, then open `http://<your-lan-ip>:<port>` from the Nimiq Pay
mini-apps section on a phone on the same network. Reference: `Eligioo/nimiq-mini-app-demo`.

## ⚠️ The architectural constraint nobody talks about
The provider **only signs transactions from the currently connected user's wallet**. There is
no exposed escrow, HTLC, or multisig primitive. Therefore any app that claims to "hold funds",
"escrow", "pool", or "pot" is either (a) running a custodial backend holding user money, or
(b) faking it. Several Cycle 1 submissions are in that category.

**Design implication:** the honest, robust architecture is *coordination layer + direct P2P
settlement*. The app computes who owes whom, each user signs their own transfer, and the app
verifies settlement by reading the chain. This is both more trustworthy and easier to ship.

## Cycle 1 landscape (62 submissions)
Winners: **Nimiq Space** (social sandbox), **NimJump** (anti-cheat game), **NimQuest** (learn-by-doing education).
Note that 1st and 2nd are both multiplayer/social.

**Saturated — avoid:** bill splitting, group savings/tandas, tipping walls, invoicing, escrow
marketplaces/bounty boards, staking dashboards, arcade game collections, prediction pools.

**Underused primitives:**
1. `sendBasicTransactionWithData` — the data field as verifiable app state. Nearly untouched.
2. The full staking suite — beyond read-only dashboards.
3. `requestDeviceIdentifier` — fair one-per-device mechanics without accounts.
4. `sign()` — gasless signed attestations.
5. Deeplinks as a designed-in growth loop.

## Strategic read
- **25% of the score has nothing to do with code.** Marketing & distribution rewards promotion,
  a demo video, showing up on the four Tuesday calls, and a polished submission package.
- **"Unique wallets that interacted" is a scored criterion.** Pick a concept whose *core action
  structurally requires a second wallet* — the growth loop should be the product, not a bolt-on.
- **Ship by end of Week 2.** Submissions go public in Week 3; that window is when unique-wallet
  count accrues. A great app that lands on the last day scores zero on the biggest single criterion.
- Support NIM for the bonus 5 points.
