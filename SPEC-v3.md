# SPM — Global x402 Challenge Spec (MainNet migration) — v3

**Audience:** a fresh Claude session with no prior context on this project.
**Repo:** `github.com/TriplEight/SPM` (public, `master`)
**Supersedes:** `SPEC.md` (12h hackathon spec) and v1/v2 of this document.
**v2 (2026-09-19):** open questions resolved (§8), claims ledger added (§5), Bazaar config confirmed against GoPlausible docs (§4.3), attestation envelope decided (§6), pricing revised (§4.2), work sequence reordered to qualify early (§9), second grill pass folded in (§3.3–3.6).
**v3 (2026-09-19, third grill pass):** `distribute()` fee-drain guard (§3.1); rekey ordering trap (§8); DSSE payload bounded to reviewed entries + free-path rate limit (§6.3); pricing turned into a measured gate (§4.2); third-party-payer recruitment promoted to P0 and started on day 1 (§9); claims ledger named as the cut line; Action fails open (§9 C3).
**v4 (2026-09-20, implementation corrections):** fixed method name `getSupported()` (§4.3); the 402 body is `{}` — payment requirements arrive in the `PAYMENT-REQUIRED` header (§4.3, §9 B5); dynamic pricing confirmed present in `@x402-avm/core`, kept out of scope (§4.2, §8); §3.4 handler/settlement ordering resolved from middleware source; rounding unit (1,000 µUSDC) separated from `MIN_DISTRIBUTE` (100,000 µUSDC) (§3.1); A2 acceptance vectors corrected to hold at 1,000 rounding (§9 A2); `GET /v1/attest` free for an unreviewed version, matching §11 (§4.2); `integrity` column added to `audit_status` — a review with no stored integrity resolves to `UNREVIEWED` (§6); confirmed Bazaar `bazaar`-key shape (§4.3); noted a boot-guard/route-validation error-text mismatch as a remaining risk (§8); contract-test harness limitation documented, points to `docs/RUNBOOK-contract-build.md` (§9).

Read this whole document before writing code. §3 lists blockers that invalidate parts of the existing architecture — do not start from `SPEC.md`'s design.

---

## 1. Context

SPM (Secure Package Manager) is an npm-compatible registry overlay. Unreviewed packages pass through to npm for free. Human-reviewed packages return HTTP 402; the caller pays a USDC micropayment on Algorand; revenue splits **50/20/15/10/5** between auditor / maintainer / adversarial-reviewer / treasury / ops. A version bump resets review status to `UNREVIEWED` — the point at which supply-chain attacks are injected.

The project won the Algorand x402 Ideathon and has a working TestNet MVP. It is entering the **Global x402 Challenge**. The team is registered for the challenge (confirmed 2026-09-19).

### Challenge requirements (hard gates)

| Requirement | Detail |
|---|---|
| Network | Algorand **MainNet**. TestNet does not count. |
| USDC ASA | **31566704** (MainNet). TestNet 10458941 for pre-flight only. |
| Network id | `ALGORAND_MAINNET_CAIP2` = `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` |
| Facilitator | **GoPlausible, mandatory** — `https://facilitator.goplausible.xyz`. No local facilitator, no direct submission. |
| Hosting | Public HTTPS domain. Localhost settlements are filed under the `DEV` source and do not count. |
| payTo | One fixed MainNet address for the whole competition — it is the leaderboard key. Opted into USDC 31566704. |
| Discovery | Bazaar discovery extension on every paid route |
| Tag | `tag: "x402-global-challenge"` in the route's `accepts.extra`. **Attribution is written at settlement time and is not retroactive** — the tag must be present before the first real payment. |
| Proof of life | ≥1 real MainNet payment settled, paid response returned, USDC in payTo, endpoint in Bazaar + challenge leaderboard |
| Submission | Form asks what the payment unlocks **and proof of who is paying for it** |
| Repo | Public, submitted to Electric Capital (`electric-capital/open-dev-data`) |

**Domain rule:** one merchant ↔ one root domain. Never share a payTo across root domains.

**What does not count (DEV bucket):** the facilitator classifies localhost traffic and repeating loop patterns (cron pings, health checks, bots, retry storms, self-payment loops) as `DEV`, even when they are real MainNet settlements. Stub-account self-payments prove the pipeline works; they will not move the challenge leaderboard.

### Timeline

- **Sept 19** (today) — 11 days to submission.
- **Sept 30** — submission form closes.
- **"Through early October"** — organisers' wording for real-usage accrual. Volume is measured over an **unannounced window** and the leaderboard has been live since July. Assume the window may close in the first week of October. **The volume engine (GitHub Action, third-party payers) must be live by Sept 30, not built in October.**
- **Early November** — 10 finalists (drawn from the top 50) present at Devcon 8, India. Top 20 endpoints share 500K ALGO.

Judging: real usage, use-case quality, technical execution, long-term potential.

### Leaderboard reality check (snapshot 2026-09-19, `src=x402-global-challenge`, API-reported range `24h`)

25 challenge-attributed merchants. #1 ≈ $515 / 4,618 settles. #2 ≈ $53. #5 ≈ $16.5. #10 ≈ $1.36. Most entries have single-digit settles. **The bar for top-20 is low; the constraint is getting any real third-party callers, not price.** Re-check before relying on this: `https://facilitator.goplausible.xyz/data/leaderboards?cat=merchants&env=mainnet&src=x402-global-challenge`.

---

## 2. Ground truth — what is actually built

Verified by reading the repo, not by trusting the README.

**Working:**
- `contracts/` — `SplitRouter` in Algorand TypeScript (Puya-TS), AlgoKit. Methods: `setRecipients`, `optInToAsset`, `attest`, `pay`. TestNet `SPLIT_APP_ID=764063661`. Unit tests pass via `algorand-typescript-testing`.
- `proxy/` — Hono overlay. npm passthrough, `better-sqlite3` review-status store, hand-rolled 402 gate on tarball paths, `/api/v1/status/:pkg/:version`.
- `mcp/` — MCP server: `check_audit_status` (free), `install_audited_package` (x402-gated, signs autonomously).
- `cli/` — `spm` wrapper.
- `scripts/verify.sh`, `scripts/e2e.mjs`, `scripts/demo.sh` — green on LocalNet.
- `.claude/` — 5 subagents, 6 commands, Algorand DevRel skills + 4 SPM-specific skills.

**Stack:** pnpm workspaces, TypeScript, Hono 4.12, `@x402-avm/{core,avm,hono,fetch}` 2.6.1, algosdk 3.5.2, better-sqlite3.

**Note on x402-avm ≥2.6:** the packages dropped `algosdk` in favour of `@algorandfoundation/algokit-utils@10.0.0-alpha.39`. Signer code written against algosdk types must use the 2.6 signer helpers (`toClientAvmSigner`). algosdk stays in the repo for contract/deploy scripts only.

**Not built:** GoPlausible facilitator integration, Bazaar discovery, MainNet config, attestation routes, attestation signing, claims ledger, per-package attribution, GPG identity, ARC-19.

---

## 3. Blockers and design constraints

### 3.1 Atomic payment-plus-split is incompatible with the mandatory facilitator

The AVM `exact` payload is `{ paymentGroup: string[], paymentIndex: number }`. The facilitator expects a **2-txn group**: Txn 0 = client's axfer to `payTo` (`fee=0`); Txn 1 = fee-payer self-payment (from == to == facilitator fee payer, amount 0, no rekey/close-to). The facilitator signs Txn 1 and submits.

SPM's current group `[axfer, appcall SplitRouter.pay(...)]` fails that validation. No config flag fixes it.

**Resolution — escrow + batched distribution:**

```
client ──facilitator──▶ payTo = SplitRouter app address (plain USDC axfer)
                                   │ USDC accrues
                                   ▼
                     distribute()  ← permissionless
                                   │
                                   ▼
              one group: 5 inner axfers, 50/20/15/10/5
```

Reasons this is right regardless of the facilitator:
1. **Fees.** A per-payment 5-way split is 6 txns ≈ 6,000 µALGO ≈ $0.0005 against a $0.001 payment.
2. **Leaderboard attribution** needs one fixed payTo; an app address is stable.
3. **Trust story:** "payment settles instantly; revenue distributes atomically and permissionlessly — anyone can trigger a payout, nobody can withhold one." Do **not** say "in the same transaction."

**Contract changes (A2):**
- Remove `pay()` from any MainNet-reachable path (LocalNet demo mode only, or delete).
- Add `distribute()` — permissionless, no args. Two separate constants apply; do not conflate them:
  - **Rounding unit = 1,000 µUSDC.** Divisible portion = `floor(balance / 1000) * 1000`. 5 inner axfers at 50/20/15/10/5 of that portion. Dust stays for the next call and is always below 1,000 µUSDC.
  - **`MIN_DISTRIBUTE` = 100,000 µUSDC ($0.10) is a separate gate, not the rounding unit.** It bounds how small a call can be, not how funds round.
  With all prices multiples of 1,000 µUSDC the split is exact (§4.2 invariant).
- **Guard `distribute()` against fee drain.** Inner-transaction fees are paid from the app account's ALGO balance unless the outer call covers them by fee pooling. Permissionless + app-paid fees = anyone can drain SPM's ALGO by calling `distribute()` in a loop on trivial balances. Two mitigations, apply **both**: (a) `assert(divisible >= MIN_DISTRIBUTE)` with `MIN_DISTRIBUTE = 100_000` µUSDC ($0.10) — roughly 200× the fee cost, so a call can never cost more than it moves; (b) set all inner fees to 0 and `assert(Global.currentApplicationCall.fee >= 6000)` so the *caller* pools the fees. Keep the app funded with ~1 ALGO regardless (min balance + headroom).
- Amount-agnostic: delete `assert(payment.assetAmount === UNIT)`.
- `attest()` must bind the tarball `dist.integrity` (sha512), not just `name@version`. **Verify current args; add if missing** — lockfiles can resolve the same `name@version` from other registries or tarball URLs.
- `setRecipients()` unchanged. In the MVP the three contributor slots point at SPM-controlled pool accounts (§5).

### 3.2 `settle.ts` auth bypass — delete before MainNet

`settleEurdBridge()` accepts any `X-PAYMENT` header whose decoded payload has a non-empty `transactionCode` and returns success without touching a chain. It is reachable on every header that fails the USDC parse. `settleUsdc()` submits whatever arrives without checking asset/amount/receiver.

**Delete the EURD path and `settle.ts` entirely.** Verification and settlement belong to the facilitator. No direct-submit fallback on MainNet.

### 3.3 The tarball route's free tier does not survive a naive middleware migration

`paymentMiddleware` route config is static: a matching route always demands payment. The tarball route must stay **free for anything below `COMMUNITY_REVIEWED`** — the core invariant.

**Fix:** use `paymentMiddlewareFromHTTPServer` and the documented `onProtectedRequest` hook to grant access when the requested version is not reviewed:

```ts
httpServer.onProtectedRequest(async (ctx) => {
  if (!isTarballPath(ctx.path)) return undefined          // other routes: normal flow
  const { name, version } = parseTarballPath(ctx.path)    // handles @scope/name
  const s = statusStore.get(name, version)
  return s.tier === 'UNREVIEWED' ? { grantAccess: true } : undefined
})
```

Test both directions in A3: unreviewed tarball → 200 with no payment; reviewed tarball → 402.

### 3.4 Handler/settlement ordering — resolved

Confirmed by reading `proxy/node_modules/@x402-avm/hono/dist/esm/index.mjs`:
1. **A failed settlement discards the handler's body.** Lines 176–182 rebuild the response from the settlement error. A signed attestation cannot leak on a failed settle. No buffering wrapper is needed.
2. **Settlement is skipped when the handler returns ≥400.** Lines 164–166 return before settlement is ever called.

Keep the pre-middleware 400 validation anyway, as a deliberate choice: it means a caller never builds and signs a payment for a request that cannot succeed.

### 3.5 USDC must be explicit; fee payer must be advertised

GoPlausible's docs show `price: "$0.01"` with no `extra.asset` resolving to **ALGO**. Every paid route sets `extra.asset: USDC_MAINNET_ASA_ID`. The documented challenge config also sets `extra.feePayer`. Read it from `/supported` at boot — do not hardcode (current MainNet value `ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA`).

### 3.6 Scoped package names break `:pkg` path params

`@babel/core` contains `/`. `GET /v1/attest/:pkg/:ver` cannot route it, and the x402 route matcher has the same problem. **Single-package attestation uses query params:** `GET /v1/attest?name=@babel/core&version=7.25.2`. That also maps directly to Bazaar's `queryParams` schema. The tarball route keeps npm's path layout and parses scoped paths explicitly (`/@scope/name/-/name-1.0.0.tgz`).

---

## 4. Target architecture

```
   agent / CI (spm-attest Action) / curl / spm CLI / MCP
                     │
                     ▼
   ┌───────────────────────────────────────────────┐
   │ SPM resource server (HTTPS, one root domain)  │
   │ Hono + @x402-avm/hono (FromHTTPServer)        │
   │                                               │
   │ POST /v1/attest/lockfile        $0.02         │ ← volume driver
   │      (free if 0 reviewed pkgs — pre-mw)       │
   │ GET  /v1/attest?name=&version=  $0.001        │ ← free unless reviewed
   │ GET  /<pkg>/-/<tarball>         $0.001        │ ← free unless reviewed
   │ GET  /api/v1/status/...         free          │
   │ GET  /api/v1/earnings/github/:login  free     │ ← claims ledger (read)
   │ POST /api/v1/claims             free          │ ← claim registration
   │ GET  /.well-known/spm-keys.json free          │ ← attestation pubkeys
   │                                               │
   │ Bazaar: declareDiscoveryExtension per route   │
   │ extra: { asset, feePayer, tag }               │
   │ ledger mw: PAYMENT-RESPONSE → accruals        │
   └──────────────────────┬────────────────────────┘
                          │ verify + settle
                          ▼
   ┌───────────────────────────────────────────────┐
   │ GoPlausible facilitator (mandatory)           │
   └──────────────────────┬────────────────────────┘
                          ▼
   ┌───────────────────────────────────────────────┐
   │ Algorand MainNet                              │
   │ USDC 31566704 → SplitRouter app (payTo)       │
   │        distribute() ─▶ auditorPool   50       │
   │                     ─▶ maintainerPool 20      │
   │                     ─▶ reviewerPool  15       │
   │                     ─▶ treasury      10       │
   │                     ─▶ ops            5       │
   └───────────────────────────────────────────────┘
```

**Entry type: Composite.** All routes share one payTo → one merchant entry, each route individually listed in the Bazaar.

### 4.1 Why the lockfile route leads

At $0.001/download, volume requires thousands of developers to change `.npmrc` — the highest-friction ask SPM has. `POST /v1/attest/lockfile` takes a `package-lock.json` and returns a signed attestation for the whole tree; one integration in CI produces a call per PR. It matches Algorand's published use-case list ("paid endpoints for trust scores, proofs, audit trails… validation services before an agent or user takes action") and it is the SOC2 CC9.1 / ISO 27001 A.15 evidence artifact the enterprise pitch already claims.

The tarball route stays — it is the differentiator and the narrative. Just don't point it at a volume leaderboard.

### 4.2 Pricing (resolved — was open question 4)

| Route | Price | µUSDC |
|---|---|---|
| `POST /v1/attest/lockfile` (≥1 reviewed pkg) | **$0.02** | 20,000 |
| `POST /v1/attest/lockfile` (0 reviewed pkgs) | **free** (signed, returned without 402) | 0 |
| `GET /v1/attest?name=&version=` (unreviewed version) | **free** | 0 |
| `GET /v1/attest?name=&version=` (reviewed version) | $0.001 | 1,000 |
| Tarball, reviewed version | $0.001 | 1,000 |

**Derivation:**
- **Dominance ceiling.** `/api/v1/status` is free and `/v1/attest` costs $0.001. A rational agent can check every package for free and pay only for reviewed ones. So the lockfile price must stay ≤ `$0.001 × typical reviewed count` or it is a bundle *premium*. With 15–30 seeded packages chosen for lockfile frequency (C2), a typical lockfile hits ~10–25 reviewed → ceiling ≈ $0.01–0.025. **$0.02 sits at the ceiling.** $0.05 (v1) was dominated at MVP coverage.
- **This number rests on an unmeasured assumption and is a gate, not a guess.** Before seeding (C2), run the candidate list against 20 real `package-lock.json` files — the SPM repo, DevCult repos, and a sample of popular OSS repos — and record the median reviewed-package count. That median sets both the price and the free-path rate: if it lands below ~10, the price drops to $0.01 and a large share of CI calls return free, which silently kills leaderboard volume. **If the median is below 5, the seed list is wrong, not the price.** Record the measurement in `NOTES.md`; it is also the honest answer to "what does the payment unlock" on the submission form.
- **Free-tier invariant.** Charging for a lockfile with zero reviewed packages would charge for nothing and contradicts "unreviewed stays free."
- **Buyer threshold.** A repo at ~30 CI runs/day spends ≈ $18/month at $0.02 — below one SCA seat and below typical no-approval card limits. At $0.05 it is ≈ $45/month.
- **Leaderboard.** 10 repos × 20 PR-triggered runs/day × $0.02 = $4/day → top-10 on the 19 Sept snapshot. Caller count, not price, is the lever.
- **Invariant:** every price is a multiple of 1,000 µUSDC so `distribute()` and the ledger split exactly.
- **Single-attest route is priced the same way as the tarball route (§11):** free for an unreviewed version, $0.001 for a reviewed one. Both free paths are rate-limited (§6.3), so neither is an unpriced signing oracle.

**Phase 2:** per-reviewed-package pricing (`$0.001 × reviewed`, capped). **Confirmed present, not a blocker:** the installed `@x402-avm/core` types define `price: Price | DynamicPrice`, where `type DynamicPrice = (context: HTTPRequestContext) => Price | Promise<Price>`. Per-reviewed-package pricing stays out of scope regardless (§10 lists dynamic pricing under "do not build").

### 4.3 Middleware + Bazaar (resolved — was open question 3)

Confirmed against GoPlausible's troubleshooting guide (algorand.co, 2026-08-13) and `getSupported()`:
- Import `declareDiscoveryExtension` from **`@x402-avm/extensions`** (new dependency; pin to the same version as the other `@x402-avm/*` packages — confirm with `pnpm view @x402-avm/extensions versions`).
- Attach per route as `extensions: declareDiscoveryExtension({...})`. **No `registerExtension` call needed** — the Hono binding detects the `bazaar` key and registers the server extension on the first paid request.
- **Confirmed shapes:** `declareDiscoveryExtension` always returns its result under the key `bazaar`. Spread that into the route's `extensions`. `validateDiscoveryExtension` takes `declaration.bazaar`, not the wrapping record.
- An empty `declareDiscoveryExtension({})` is valid. A malformed one fails **silently**: payments still settle, the catalog row never appears. Validate in a unit test: `validateDiscoveryExtension(decl.bazaar).valid === true`.
- The catalog row is created **when a client pays**, from the payment payload. The facilitator does not crawl the host.
- Merchant branding comes from `og:site_name`, `og:title`, `og:description`, `og:image` at the domain root. Trigger one more payment after changing them. No NFD step is required.

```ts
import { Hono } from 'hono'
import {
  paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer,
} from '@x402-avm/hono'
import { HTTPFacilitatorClient } from '@x402-avm/core/server'
import { registerExactAvmScheme } from '@x402-avm/avm/exact/server'
import { ALGORAND_MAINNET_CAIP2, USDC_MAINNET_ASA_ID } from '@x402-avm/avm'
import { declareDiscoveryExtension } from '@x402-avm/extensions'

const facilitator = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL! })
const kinds = (await facilitator.getSupported()).kinds
// CAUTION: the method is getSupported(), not supported().
const FEE_PAYER = kinds.find(k => k.network === ALGORAND_MAINNET_CAIP2 && k.scheme === 'exact')
  ?.extra?.feePayer
if (!FEE_PAYER) throw new Error('facilitator does not support algorand mainnet exact')

const PAY_TO = process.env.SPLIT_APP_ADDRESS!

const accepts = (price: string) => ({
  scheme: 'exact',
  network: ALGORAND_MAINNET_CAIP2,
  payTo: PAY_TO,
  price,
  maxTimeoutSeconds: 120,
  extra: {
    asset: USDC_MAINNET_ASA_ID,          // never omit — default may resolve to ALGO
    feePayer: FEE_PAYER,
    tag: 'x402-global-challenge',        // attribution; not retroactive
  },
})

const routes = {
  'POST /v1/attest/lockfile': {
    accepts: accepts('$0.02'),
    description:
      'Signed in-toto attestation for every package in a package-lock.json: ' +
      'human review tier, reviewer, tarball integrity match, and the Algorand ' +
      'txid anchoring each review. Free when no package in the tree is reviewed.',
    mimeType: 'application/json',
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: { lockfileVersion: 3, packages: { 'node_modules/ms': { version: '2.1.3', integrity: 'sha512-…' } } },
      inputSchema: {
        properties: { lockfileVersion: { type: 'integer' }, packages: { type: 'object' } },
        required: ['lockfileVersion', 'packages'],
      },
      output: { example: { summary: { total: 512, reviewed: 14, unreviewed: 497, integrityMismatch: 0 },
                           attestation: { payloadType: 'application/vnd.in-toto+json', payload: '…', signatures: [{ keyid: 'SPM…', sig: '…' }] } } },
    }),
  },
  'GET /v1/attest': {
    // accepts('$0.001') applies only to a reviewed version.
    // Free tier for an unreviewed version via onProtectedRequest (§3.3, §4.2).
    accepts: accepts('$0.001'),
    description: 'Signed human-review attestation for one npm package version (query: name, version).',
    mimeType: 'application/json',
    extensions: declareDiscoveryExtension({
      input: { name: 'ms', version: '2.1.3' },
      inputSchema: { properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name', 'version'] },
      output: { example: { tier: 'COMMUNITY_REVIEWED', attestation: { /* DSSE */ } } },
    }),
  },
  // tarball route: same accepts('$0.001'); free tier via onProtectedRequest (§3.3)
}

const server = new x402ResourceServer(facilitator)
registerExactAvmScheme(server)
const httpServer = new x402HTTPResourceServer(server, routes)
httpServer.onProtectedRequest(/* §3.3 */)
app.use(paymentMiddlewareFromHTTPServer(httpServer))
```

Verify exact constructor/hook signatures against the installed 2.6.1 types; the shapes above follow GoPlausible's Hono examples.

**The 402 JSON body is `{}`.** Payment requirements arrive base64-encoded in the
**`PAYMENT-REQUIRED` response header**, not in the body. A decoded example:
```json
{"scheme":"exact","network":"algorand:wGHE2...","amount":"1000","asset":"31566704",
 "payTo":"<PAY_TO>","maxTimeoutSeconds":60,
 "extra":{"name":"USDC","decimals":6,"asset":"31566704","feePayer":"<feePayer>","tag":"x402-global-challenge"}}
```
Check `bazaar` and `tag` against the decoded header, never against the body.

**Check commands (from GoPlausible):**
```bash
# -i prints response headers, which is why this grep finds anything at all.
curl -i https://<domain>/v1/attest?name=ms\&version=2.1.3 | grep -i "PAYMENT-REQUIRED"
curl -sI https://<domain>/v1/attest?name=ms\&version=2.1.3 \
  | awk -F': ' '/^payment-required/{print $2}' | base64 -d | jq .
curl -s "https://facilitator.goplausible.xyz/discovery/resources?limit=1000" | jq '.items[] | select(.resourceUrl|contains("<domain>"))'
for s in x402-global-challenge bazaar direct dev; do
  curl -s "https://facilitator.goplausible.xyz/data/leaderboards?cat=merchants&limit=200&range=all&env=mainnet&src=$s" \
  | jq --arg a "$PAY_TO" '.items[] | select(.address==$a) | {rank,settles,volume}'; done
```
If volume lands under `dev` or `direct`, attribution is broken.

---

## 5. Contributor claims (resolved — was open question 2)

**Principle:** no contributor is expected to be pre-registered. Revenue attributable to a GitHub identity accrues in escrow from the first payment. The identity claims later by proving GitHub control and supplying an Algorand address. The MVP ships the accrual ledger and claim registration; payouts are manual.

> This moves per-package attribution **into** scope (v1 listed it under Do-not-build). Scope is limited to what follows.

### 5.1 On-chain

`setRecipients(auditorPool, maintainerPool, reviewerPool, treasury, ops)` — three SPM-controlled **pool accounts** (these are the MVP "stub accounts") plus treasury and ops.

Why pools per role and not one treasury: (a) owed funds are never commingled with SPM revenue; (b) **per-role proof of reserves** — anyone can check `pool balance ≥ unclaimed ledger total for that role`; (c) Lora still shows five distinct recipients per `distribute()`.

Pool keys are **cold** — not on the server, not in `.env`. Payouts are signed locally by a script.

### 5.2 Off-chain ledger (SQLite)

```sql
accruals(settle_txid, route, pkg, version, role, identity, amount_micro, created_at,
         PRIMARY KEY (settle_txid, role, pkg, version))   -- idempotent
claims(identity, algorand_address, proof_kind, proof_ref, status, verified_at)
payouts(identity, role, amount_micro, txid, paid_at)
```

**Attribution rules:**
- **auditor** → `github:<reviewer>` from the review record.
- **maintainer** → `github:<owner>` parsed from the npm packument's `repository.url` for that version. Self-declared by the publisher, so mark `repo_verified=false`. Phase 2: prefer npm provenance (`dist.attestations`) where present. Non-GitHub or missing repo → `unassigned`.
- **reviewer** (adversarial, 15%) → `unassigned` in the MVP; no adversarial review exists yet. It stays in `reviewerPool` and is shown publicly as the future bounty budget.
- **treasury / ops** → not ledgered; paid directly by `distribute()`.
- **Tarball / single attest:** 100% of each role share goes to that package's identities.
- **Lockfile:** role shares split pro-rata across the *reviewed* packages in the lockfile. Integer division; the remainder goes to the first package in sort order, so ledger sums equal pool inflows exactly.

**Write path:** a Hono middleware registered *outside* the payment middleware. After `next()`, if the response carries `PAYMENT-RESPONSE` with success, decode the settle txid and write accruals from attribution data the handler put on the context (`c.set('attribution', …)`). No dependency on undocumented resource-server hooks.

**Reconciliation:** a nightly job lists USDC axfers into payTo (indexer) and compares them with ledger `settle_txid`s. Unmatched inflows (crash between settle and write, direct deposits) are ledgered as `unassigned`.

### 5.3 Claim flow (MVP)

1. `GET /api/v1/earnings/github/:login` — public, free: accrued / claimed per role.
2. `POST /api/v1/claims {identity, algorandAddress}` → returns a nonce.
3. The claimant publishes proof:
   - **Maintainer (user or org):** commit `.well-known/spm-claim.json` `{ "algorand": "<addr>", "nonce": "<nonce>" }` to the default branch of the repo the package points to. This proves write access, works identically for users and orgs, and needs no OAuth app.
   - **Reviewer (user):** a public gist owned by `<login>` containing `spm-claim:<addr>:<nonce>`.
4. SPM verifies via the GitHub API (authenticated token, read-only) → `status=verified`.
5. **Payout:** manual, batched, signed locally from the pool key, with a human check of each claim. Recorded in `payouts`.

The recipient address must be opted into USDC 31566704 before payout. The claim page says so.

**Unclaimed funds:** no expiry in the MVP. Stated publicly.

### 5.4 Notification (MVP = manual only)

- **No automated issues, PRs, or emails to third-party repos.** Bot-opened issues on popular repos read as spam and risk GitHub AUP enforcement and reputational damage to a security product. Unsolicited commercial email is restricted under German UWG §7.
- MVP: the public earnings page, plus **hand-written, one-per-maintainer** outreach for seeded packages once accrual exceeds a threshold (e.g. $1).
- Phase 2: opt-in notifications (GitHub App installed by the maintainer, or a `FUNDING.yml`-style opt-in).

### 5.5 Out of scope for MVP (Phase 2)

On-chain claimable balances (box per identity hash, oracle-signed identity binding, `claim()` without an admin key in the path); automated payouts; provenance-verified maintainer mapping; adversarial-review bounties from `reviewerPool`.

**Legal note before the first real third-party payout:** SPM holds funds owed to third parties. For a German operator this may touch payment-services regulation (ZAG). Get a lawyer's read before paying anyone who is not the team. It is not judged in the challenge; it is personal exposure. The Phase 2 on-chain claim design is also the mitigation.

---

## 6. Attestation signing (resolved — was open question 5)

### 6.1 Is a signature needed at all?

For the immediate HTTP caller, TLS already authenticates the response. The signature matters for **every consumer after that**:
- compliance evidence filed and checked months later (the SOC2/ISO pitch) — must verify after the database has changed or SPM is gone;
- agent-to-agent handoff (MCP result passed to another tool);
- CI artifacts attached to a release.

An unsigned "attestation" is a JSON report anyone can edit. Offline verification here means **pubkey only, no network** — ed25519, cheap to implement. Keep it.

### 6.2 Key: dedicated service key, not an auditor key

The lockfile attestation is SPM's statement *aggregating* many reviewers' on-chain `attest()` records, so it is signed by an **SPM attestation key**:
- ed25519, generated as an Algorand account so `keyid` is a familiar 58-char address. **Never funded, never used on-chain.** Single purpose — this also makes cross-protocol signature reuse moot.
- Hot key on the server by necessity. Separate from payTo/admin/pool keys.
- Published at `/.well-known/spm-keys.json`: `[{ keyid, publicKey, validFrom, validUntil }]`. Rotation = append.
- Optional (if cheap during A2): store the active pubkey in SplitRouter global state via admin `setAttestationKey()` so trust roots on-chain.

Auditor keys never live on the server. In the MVP the auditor is the team, but retrofitting key separation later would change the `keyid` on every published attestation.

### 6.3 Envelope: DSSE + in-toto Statement v1

The supply-chain standard (SLSA, Sigstore, npm provenance). DSSE signs exact payload bytes, so **no JSON canonicalisation** is needed.

```json
{
  "payloadType": "application/vnd.in-toto+json",
  "payload": "<base64(Statement JSON bytes)>",
  "signatures": [{ "keyid": "<SPM attestation key address>", "sig": "<base64 ed25519>" }]
}
```
`sig = ed25519_sign(PAE)`, where `PAE = "DSSEv1" SP len(type) SP type SP len(payload) SP payload`.

**Do not use `algosdk.signBytes`** — it prepends `MX` and breaks standard DSSE verifiers. Sign PAE with raw ed25519 (`@noble/ed25519` or tweetnacl) using the 32-byte seed from the account secret key.

**Lockfile statement:**
```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "package-lock.json", "digest": { "sha256": "<hex of exact request body bytes>" } }],
  "predicateType": "https://<domain>/attestation/lockfile/v1",
  "predicate": {
    "issuer": "https://<domain>",
    "issuedAt": "2026-09-25T12:00:00Z",
    "network": "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    "registryAppId": 0,
    "lockfileVersion": 3,
    "summary": { "total": 512, "reviewed": 14, "unreviewed": 497, "unresolvable": 1, "integrityMismatch": 0 },
    "packages": [{
      "name": "ms", "version": "2.1.3",
      "integrity": "sha512-…",
      "tier": "COMMUNITY_REVIEWED",
      "reviewer": "github:<login>",
      "reviewScope": "full-source+install-scripts",
      "attestTxid": "…",
      "integrityMatch": true
    }]
  }
}
```

**Single-package statement:** subject `{ "name": "pkg:npm/ms@2.1.3", "digest": { "sha512": "<hex from integrity>" } }`, same predicate shape with one package.

**Rules:**
- The subject digest is over the **raw request body**. The CLI and Action must POST file bytes unchanged — no re-serialisation.
- `integrityMatch: false` → tier reported as `INTEGRITY_MISMATCH`, never `COMMUNITY_REVIEWED`.
- Git, tarball-URL, or non-npm `resolved` entries → `UNRESOLVABLE`.
- Limits: body ≤ 5 MB, ≤ 10,000 entries, `lockfileVersion` 2 or 3; otherwise 400 (pre-middleware, before any 402 — §3.4).
- **`predicate.packages` lists only reviewed, `INTEGRITY_MISMATCH`, and `UNRESOLVABLE` entries — never the unreviewed majority.** A 10,000-entry lockfile would otherwise produce a multi-MB signed payload dominated by "we know nothing about this." `summary` carries the counts; absence from `packages` means `UNREVIEWED`, and the statement says so in `predicate.absentMeans: "UNREVIEWED"`. This keeps a typical response in the low tens of KB.
- Response: `{ summary, attestation }`. `summary` is an unsigned convenience copy; verifiers use `attestation`.
- **Free path is rate-limited.** A zero-coverage lockfile still costs a parse, ~500 status lookups, and a signature. Cap the free path per IP (e.g. 20/hour, 429 beyond) so it cannot be used as an unpriced signing oracle.

**Verification levels:**
- **L1 (offline, MVP):** `spm verify att.json --lockfile package-lock.json` — checks the ed25519 signature against keyid ∈ pinned or `.well-known` keys, and the sha256 of the local file against the subject.
- **L2 (online, Phase 2):** fetch each `attestTxid` from the indexer and confirm it matches.

### 6.4 Integrity binding (new — discovered while building)

An attestation must bind to a specific tarball. `audit_status` carries an `integrity` column.

**A review record with no stored integrity is not a complete review.** It resolves to `UNREVIEWED`.

WARNING: without this rule the signed statement reports `integrityMatch: true` having
compared nothing. That is a fabricated field in a paid security claim. §7 already
forbids fabricated review records; this is the same failure.

---

## 7. Honesty constraints for seeded data (new)

A paid security attestation on MainNet that claims a human review that did not happen is a fabricated record — the same class of failure as the EURD bypass, and worse for this pitch.

- **Every seeded `COMMUNITY_REVIEWED` record is a real review** of that exact tarball (integrity-bound), with `reviewer` and `reviewScope` recorded.
- **Seed selection:** small, ubiquitous transitive dependencies that a human can genuinely review in 15–30 minutes and that appear in most lockfiles (tiny single-purpose packages such as `ms`, `inherits`, `once`, `wrappy`, `balanced-match`, `escape-string-regexp` — confirm by frequency across a sample of real lockfiles). This maximises lockfile hit-rate (§4.2) *and* keeps the reviews honest. Big packages (lodash, react) are out until there is reviewer capacity.
- **Target 15–30 packages**, not 20–50. Split reviews between Denis and Vasiliy.
- The tier name `COMMUNITY_REVIEWED` implies more than one reviewer. Either keep it and let `reviewer` make single-reviewer status explicit, or rename to `REVIEWED` before the first MainNet attest. **Decide before B4** — names are immutable once anchored.
- Qualification payments from team wallets are labelled as such in `NOTES.md` and the submission. The "who is paying" answer must rest on third-party payers (§9 P0).

---

## 8. Resolved questions and remaining risks

| # | v1 question | Status |
|---|---|---|
| 1 | Registration | **Resolved** — team is registered. |
| 2 | Recipients / payTo | **Recipients resolved** (§5 claims). **payTo-to-app-account still open** → tested in A3 (below). |
| 3 | Bazaar `extensions` shape | **Resolved** (§4.3). |
| 4 | Price | **Resolved** — $0.02 lockfile, free at zero coverage (§4.2). |
| 5 | Signing | **Resolved** — DSSE + in-toto v1, dedicated ed25519 service key (§6). |
| 6 | Handler/settle ordering | **Resolved** — confirmed by reading the middleware source (§3.4). |
| 7 | Dynamic pricing support | **Resolved** — confirmed present in `@x402-avm/core`. Kept out of scope (§4.2, §10). |

**Still open:**
- **payTo = application address.** Nothing in GoPlausible's docs precludes it: the merchant is keyed by address, and an opted-in app account receives axfers. **Test on TestNet in A3** by pointing payTo at the TestNet SplitRouter app address and settling one payment through GoPlausible. **Fallback (preferred over a sweep):** payTo = plain account opted into USDC, then **rekeyed to the SplitRouter app address**. `distribute()` issues the inner axfers with `sender = payTo`, so funds still move directly and atomically with no custodial hop. After rekey, only the app can move funds — include an admin-gated `releaseAuthority(to)` and disclose it.
  **Order is not reversible: opt into USDC 31566704 *before* rekeying.** A rekeyed account cannot sign anything with its own key, including its own asset opt-in, and the app cannot opt it in before the rekey exists. Getting this backwards on MainNet strands the address and forces a new payTo — which, after the first settled payment, means starting the leaderboard entry over. Rehearse the full sequence (opt-in → rekey → inner-axfer from the rekeyed sender) end-to-end on TestNet in A3 before touching MainNet, and confirm there that an app can issue inner transactions on behalf of an account rekeyed to it.
- **DEV classification heuristics** are not published. Mitigation: event-triggered CI only (no `schedule:`), one wallet per adopting team, no retries on 402 beyond the protocol's single retry.
- **Tier naming** (§7).
- **Facilitator boot-guard/route-validation mismatch (new — remaining risk).** Two facilitator checks disagree. `resolveFeePayer` accepts a supported-kind that omits `x402Version`. The payment middleware's route validation requires it. A response missing that field passes the boot guard, then fails route validation, and reports that the facilitator does not support `exact`. Both failures happen before the port binds, so behaviour is correct — but the error text misleads whoever reads it first.

---

## 9. Work sequence

Reordered versus v1: **qualify on the simplest route first**, then build the volume features. Each item has a check a transcript can prove (the repo's `/goal` convention). "Day N" means N days from Sept 19; phase items are lettered (A1, B4, D3) and never refer to days.

**Start P0 on day 1, before any code.** It is the longest-lead item in the plan and the only one whose latency is other people's.

**P0. Recruit third-party payers (spans the whole plan; owner: Denis).** Line up 3–10 external repos — DevCult network, hackathon peers, ideathon contacts — that will run `spm-attest` **with their own wallets**. Each one needs a MainNet Algorand address, a USDC opt-in, and a few dollars of USDC on Algorand. **Acquiring Algorand-native USDC is the bottleneck**: most people hold nothing on Algorand, and an exchange withdrawal or bridge hop takes days, not minutes. Send the ask and the funding instructions on day 1; chase on day 4 and day 7. Getting the Action merged (C3) is the easy half.
*Check:* by D8, ≥3 external addresses are funded and opted in, confirmed on-chain — before the Action even exists.

Why this outranks everything below it: qualification needs one payment the team can make itself, but placement and the submission form's "proof of who is paying" both need strangers. Every engineering item here is under the team's control; this one is not.

### Phase A — unblock (D1–D2)

**A1. Delete the EURD bridge.** Remove `settleEurdBridge`, the EURD `accepts` branch, `withEurPayment` in `mcp/src/tools/install.ts`, the `@ever_amsterdam/x402-euro-eurd` dependency, and EURD env vars.
*Check:* `grep -ri "eurd\|quantoz" proxy/src mcp/src` empty; `pnpm typecheck` passes.

**A2. Rework `SplitRouter`.** Add `distribute()`; remove `pay()` from MainNet paths; amount-agnostic; bind `integrity` in `attest()` (§3.1). Optional: `setAttestationKey()`; `releaseAuthority()` only if the rekey fallback is chosen.
*Check:* unit test, held at 1,000 rounding, not 100,000:
- Fund the app with 777,700 µUSDC → `distribute()` emits 388500/155400/116550/77700/38850. 700 remains in the app.
- Add 99,300 µUSDC (balance now 100,000) → `distribute()` emits 50000/20000/15000/10000/5000. 0 remains. This exercises the `MIN_DISTRIBUTE` boundary exactly.
- A balance of 99,999 floors to 99,000, below `MIN_DISTRIBUTE` — the call fails.

CAUTION: **contract-test harness limitation.** These tests run under
`algorand-typescript-testing`, in JavaScript. They do not prove the contract compiles
under Puya or runs on the AVM. The harness also does not mutate ledger balances from
inner transactions, so the remaining-dust assertions above are arithmetic, not balance
reads. A human runs `algokit project run build` to regenerate TEAL and the typed
client. See `docs/RUNBOOK-contract-build.md`.

**A3. Migrate the proxy to `paymentMiddlewareFromHTTPServer` + GoPlausible on TestNet.** Delete `settle.ts`. Add the `onProtectedRequest` free-tier grant (§3.3). **payTo = TestNet SplitRouter app address** (resolves the §8 open item). Read the middleware source for §3.4 and record findings in `NOTES.md`.
*Check:* unreviewed tarball → 200 without payment; reviewed tarball → 402 with the decoded `PAYMENT-REQUIRED` header containing `bazaar` and `tag`; paying via `@x402-avm/fetch` → 200; USDC arrives in the app account on TestNet; `scripts/verify.sh` green.

### Phase B — MainNet qualification (D3–D5)

**B1. Provision MainNet.** Deploy account, SplitRouter (or payTo + rekey per A3 outcome), 3 pool accounts, treasury, ops. Opt the app/payTo and all five recipients into 31566704. `setRecipients(...)`. Generate the attestation key (unfunded). Pool mnemonics go to cold storage, not `.env`.
*Check:* app/payTo shows the USDC opt-in on MainNet; explorer links in `NOTES.md`.

**B2. MainNet config.** `ALGORAND_MAINNET_CAIP2`, `USDC_MAINNET_ASA_ID`, `ALGOD_SERVER=https://mainnet-api.algonode.cloud`, `FACILITATOR_URL=https://facilitator.goplausible.xyz`, `SPLIT_APP_ADDRESS`, `ATTEST_SIGNING_KEY`. Update `.env.example`.
*Check:* the server refuses to boot if `/supported` lacks MainNet `exact`; it logs the resolved `feePayer`.

**B3. Deploy to public HTTPS** on one root domain (fly.io / Railway / VPS + Caddy). Add `og:*` metadata at the domain root.
*Check:* `curl -sI "https://<domain>/v1/attest?name=ms&version=2.1.3"` → 402 from the public internet.

**B4. Single-package attest route + DSSE signing** (§6). Seed 3–5 genuinely reviewed packages so the route returns something real. Settle the tier name (§7) before the first MainNet `attest()`.
*Check:* the response verifies with `spm verify` offline; a tampered payload fails.

**B5. Bazaar + tag** on the single-package route (§4.3). `validateDiscoveryExtension` unit test.
*Check:* the 402 JSON body is `{}`. Decode the base64 `PAYMENT-REQUIRED` response header and confirm it contains `bazaar` and `tag`. Do not inspect the body — it never carries them.

**B6. First real MainNet payment + `distribute()`.** One manual payment (not scripted, not from localhost) → resource appears in `/discovery/resources` → merchant appears under `src=x402-global-challenge` → call `distribute()`.
*Check:* the settle txid, the Lora link to the 5-inner-transfer group, and the leaderboard source-loop output are in `NOTES.md`. **At this point the entry qualifies.**

### Phase C — volume features (D6–D9)

**C1. `POST /v1/attest/lockfile`** with body limits, pre-middleware 400 validation, the zero-coverage free path, and pro-rata attribution data on the context.
*Check:* a real ~300-dep lockfile returns an envelope covering every entry; zero-coverage lockfile → 200 without 402; a malformed lockfile → 400 without settlement.

**C2. Seed reviews to 15–30 packages** (§7) — starts day 2, runs in parallel with everything; human review time is the bottleneck. Gate on the hit-rate measurement in §4.2 before reviewing anything.
*Check:* the hit-rate median is recorded in `NOTES.md`; `/api/v1/status` returns the tier, reviewer, scope, and MainNet attest txid for each package.

**C3. `spm-attest` GitHub Action** — triggers on `pull_request` / `push` only (never `schedule:`), reads a wallet secret, POSTs raw lockfile bytes, uploads the envelope as an artifact, and optionally fails on `INTEGRITY_MISMATCH`. **Fails open by default:** a facilitator outage, a 5xx, or a missing wallet secret logs a warning and exits 0. An attestation step that can redden someone else's CI gets removed from their repo the first time it does, and that is the volume gone.
*Check:* runs green on the SPM repo and on one external repo; with `FACILITATOR_URL` pointed at a dead host it warns and still exits 0.

**C4. Claims ledger MVP** (§5): accrual middleware, reconciliation job, earnings endpoint, claim registration with gist/repo-file verification, and a local payout script. **This is the designated cut line.** It is the largest item in Phase C and the only one that neither qualifies the entry nor produces volume. If the schedule slips, ship the accrual middleware and the reconciliation job alone — the ledger keeps accruing correctly and nothing is lost but the claim UX — and move the earnings endpoint, claim verification, and payout script to Phase 2. Do not trade P0 or C3 time for it.
*Check:* one paid lockfile call → accruals sum exactly to the role shares of 20,000 µUSDC; test identity claim verifies from a real gist; payout script dry-run prints the correct batch.

### Phase D — submit and seed real usage (D9–D11, before Sept 30)

- **D1** Land P0: the recruited repos merge the Action and make their first paid calls from their own wallets. Confirm each shows up as a distinct payer under `cat=payers`. This is the "proof of who is paying," and it is the one item that cannot be compressed on the last day.
- **D2** MCP server on MainNet (`@x402-avm/fetch` `wrapFetchWithPayment`) — agents discovering SPM via the Bazaar / GoPlausible Universal Client are also real callers.
- **D3** Repo hygiene: remove `.DS_Store`, `proxy/demo-proxy.log`, stray `proxy/pnpm-workspace.yaml`; reconcile workspaces; README `npm install` → `pnpm install`; `.gitignore` gets `.DS_Store`, `*.log`.
- **D4** README rewrite for MainNet: endpoints, prices, how to call, how to verify, leaderboard link.
- **D5** Submit the form. **D6** Submit the repo to Electric Capital. **Do not leave D5 to Sept 30** — file by Sept 28 with whatever is live; the leaderboard keeps accruing after submission, but the form does not reopen.

**Do not manufacture volume.** Self-payment loops land in `DEV` anyway, and judges weigh real usage.

---

## 10. Do not build

GPG identity · ARC-19 NFTs · Postgres/Redis · reputation scoring · peer review / cross-signing · adversarial-review UX · governance/DAO · CodeQL auto-scan · Dependabot/Renovate integrations · PyPI/crates.io · Stripe pre-funding · subscriptions · EURD/Quantoz · direct-submit settlement fallback · `MISSION_CRITICAL_SAFE` / `CVE_KNOWN` tiers · automated maintainer notifications · on-chain claimable balances · automated payouts · L2 online verification · dynamic pricing.

*Moved into scope in v2:* per-package attribution, limited to the off-chain ledger in §5.

Use the `scope-sentinel` subagent before anything sizable.

---

## 11. Canonical facts

- Packages: `@x402-avm/{core,avm,hono,fetch,extensions}`, all pinned to the same version (2.6.1 unless `extensions` requires otherwise). Not `@x402/*` — GoPlausible's long-form docs use `@x402/*` names; the published scope is `@x402-avm`.
- MainNet USDC **31566704**; TestNet **10458941**. 6 decimals.
- `ALGORAND_MAINNET_CAIP2 = algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`.
- Scheme `exact`. Middleware price is a USD string; on-chain amounts are integer µ-units. **Never floats.** Every price is a multiple of 1,000 µUSDC.
- `extra = { asset, feePayer, tag: "x402-global-challenge" }` on every paid route.
- Split **50/20/15/10/5** → per 1,000 µUSDC: 500/200/150/100/50.
- Facilitator `https://facilitator.goplausible.xyz`, mandatory. It pays network fees for payers; `distribute()` fees are SPM's.
- Status `< COMMUNITY_REVIEWED` never returns 402 — tarball, single attest, and zero-coverage lockfile alike.
- Version bump → `UNREVIEWED`. The narrative spine.
- Attestations: DSSE + in-toto Statement v1, ed25519, dedicated unfunded service key.
- pnpm only, `pnpm add --save-exact`.
- Append a dated `NOTES.md` entry after each unit of work (`/handoff`).

---

## 12. Files to change

| Path | Change |
|---|---|
| `SPEC.md` | Mark superseded; link here |
| `CLAUDE.md` | MainNet constants; invariants: "payTo is fixed and is the leaderboard key", "never split per-payment", "extra.asset always explicit", "unreviewed never 402", "seeded reviews are real reviews"; remove TestNet-only constraint |
| `contracts/.../contract.algo.ts` | `distribute()`; drop MainNet `pay()`; amount-agnostic; `integrity` in `attest()`; optional `setAttestationKey()` / `releaseAuthority()` |
| `contracts/.../contract.algo.spec.ts` | Remainder/dust tests (A2) |
| `proxy/src/app.ts` | `paymentMiddlewareFromHTTPServer`; `onProtectedRequest` free tier; routes + Bazaar + `extra`; ledger middleware; `.well-known/spm-keys.json` |
| `proxy/src/settle.ts` | **Delete** |
| `proxy/src/routes/attest.ts` | **New** — lockfile + single attestation, pre-validation, zero-coverage free path |
| `proxy/src/attest/dsse.ts` | **New** — PAE, sign, verify |
| `proxy/src/claims/*` | **New** — ledger, reconciliation, earnings, claims verification |
| `scripts/payout.ts` | **New** — local, batched, dry-run by default |
| `cli/` | `spm verify` (L1) |
| `.github/actions/spm-attest/` | **New** — composite Action |
| `mcp/src/tools/install.ts` | Remove EURD; MainNet; `wrapFetchWithPayment` |
| `mcp/package.json` | Drop `@ever_amsterdam/x402-euro-eurd` |
| `proxy/package.json` | Add `@x402-avm/extensions`, `@noble/ed25519` (exact pins) |
| `.env.example` | MainNet block; `ATTEST_SIGNING_KEY`; no pool/recipient mnemonics |
| `scripts/verify.sh` | MainNet smoke: 402 → pay → 200 → USDC delta → envelope verifies |
| `README.md` | MainNet rewrite; `pnpm install` |
| `.gitignore` | `.DS_Store`, `*.log` |

---

## 13. Definition of done (qualification + placement)

**Qualification (by ~D5, hard deadline Sept 30):**
- [ ] Public HTTPS endpoint on MainNet returns 402 without payment; unreviewed tarballs return 200 free
- [ ] Payments verified and settled through GoPlausible; `extra.asset` = 31566704 confirmed in a settled txn
- [ ] `x402-global-challenge` tag present before the first real payment; Bazaar row exists
- [ ] ≥1 real MainNet payment; paid response returned; USDC in payTo
- [ ] Merchant visible under `src=x402-global-challenge` (not `dev`/`direct`)
- [ ] `distribute()` executed on MainNet; 5 inner transfers verified on Lora
- [ ] Attestation verifies offline with `spm verify`
- [ ] No EURD path anywhere; `settle.ts` gone; `scripts/verify.sh` green
- [ ] Form submitted; repo submitted to Electric Capital

**Placement (by Sept 30, running into early October) — in priority order:**
- [ ] **≥3 external payers funded, opted in, and settling from their own wallets** (P0) — visible as distinct addresses under `cat=payers`
- [ ] `spm-attest` Action running on those repos, failing open
- [ ] Lockfile route live with zero-coverage free path; hit-rate median recorded
- [ ] 15–30 genuinely reviewed packages anchored on MainNet
- [ ] Claims ledger accruing (earnings endpoint and claim verification may slip to Phase 2)
