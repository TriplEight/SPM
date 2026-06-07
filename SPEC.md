# SPM — Hackathon Engineering Spec (12h MVP)

**Event constraints:** 2 devs · ~12h · all code via Claude Code · Algorand TestNet · language: TypeScript end-to-end.
**Primary track:** Agentic Commerce. **Bonus:** Quantoz (EURD) — opt in only if it costs <30 min.

---

## 1. Demo thesis (what must work on stage)

An **AI agent** autonomously installs a dependency. For a **human-audited** package the install hits **HTTP 402**, the agent **signs and pays USDC on Algorand**, and a single **atomic group txn fans the payment out 50/20/15/10/5** to auditor / maintainer / adversarial-reviewer / treasury / ops — gated by a **machine-readable audit status**, over an **npm-compatible proxy** with zero migration. Unreviewed packages stay free.

The novel, on-theme sentence for judges: *"an autonomous agent pays an x402 micropayment to install a peer-reviewed package, and five parties get paid on-chain in one transaction."*

Everything else (GPG identity, ARC-19 NFTs, Postgres/Redis, reputation, governance, multi-language) is **out of scope for 12h**.

## 2. Scope

**In (must-have):**
- Hono proxy transparently forwarding to `registry.npmjs.org`.
- Audit-status store — **SQLite** (raw SQL or better-sqlite3), *not* Postgres/Drizzle/Redis.
- x402 `402` gate on `COMMUNITY_REVIEWED+`; free passthrough otherwise. Wired with `@x402-avm/*`.
- Algorand USDC payment + verification (TestNet, ASA `10458941`).
- **`SplitRouter` AVM contract** — atomic 5-way inner-txn split. The centerpiece.
- Audit attestation as a contract **box** entry (not ARC-19).
- **MCP server** exposing `check_audit_status` (free) and `install_audited_package` (x402-gated) — the agentic-commerce hero path.
- `spm` CLI wrapper (secondary / human path) doing the 402→pay→retry loop.
- `GET /api/v1/status/:pkg/:version` machine-readable endpoint.

**Out (say "post-hackathon" in pitch):** GPG keys, ARC-19, Postgres+Redis, adversarial-review UX, reputation scoring, Dependabot/Renovate, CodeQL auto-scan, governance, Stripe pre-funding, multi-language.

## 3. Architecture

```
        check_audit_status / install_audited_package
┌──────────────┐  (MCP, agent-driven)   ┌──────────────────────┐  miss  ┌───────────────────┐
│  AI agent /  │ ─────────────────────► │  Hono proxy/overlay  │ ─────► │ registry.npmjs.org│
│  spm CLI     │ ◄──── 402 / 200 ─────── │  - status lookup     │ ◄───── │  (upstream)       │
└──────┬───────┘                        │  - x402 gate         │        └───────────────────┘
       │ sign USDC axfer + appcall       │  - verify + settle   │
       ▼                                 └──────────┬───────────┘
┌─────────────┐                                     │ submit atomic group
│ @x402-avm + │                                     ▼
│ algosdk     │                        ┌────────────────────────────┐
└─────────────┘                        │ SplitRouter App (AVM)       │
                                        │  pay()  → 5 inner ASA xfers │
                                        │  attest() → box write       │
                                        └────────────────────────────┘
```

**Stack (TS everywhere):**
- Proxy/CLI/MCP: TypeScript + Hono + `@x402-avm/core` + `@x402-avm/avm` + `algosdk`.
- Contract: **Algorand TypeScript (`@algorandfoundation/algorand-typescript`, Puya-TS)** via AlgoKit. Falls back to Algorand Python only if the agent stalls — but the DevRel skills cover TS, so default TS.
- Toolchain: AlgoKit (LocalNet → TestNet), Lora explorer, Circle USDC faucet.

## 4. Smart contract — `SplitRouter` (the differentiator)

Single ARC-4 app: receives a USDC payment grouped before an app call, fans out via inner transactions.

**State**
- Global: 5 recipient addresses (auditor, maintainer, adversarial, treasury, ops), payment ASA id.
- Boxes: `attest:<pkg>@<ver>` → packed `{auditor, txid, status, ts}`.

**ABI**
```
pay(payment: gtxn.AssetTransferTxn, pkg: string, ver: string) -> void
  // assert payment.xferAsset == ASSET_ID
  // assert payment.assetReceiver == app address
  // assert payment.assetAmount == UNIT  (1000 µUSDC = $0.001)
  // 5 inner axfer: 500 / 200 / 150 / 100 / 50
  // log(pkg@ver, payment.sender)  -> proxy reads to confirm settlement

attest(pkg: string, ver: string, status: uint64) -> void   // sender-gated
setRecipients(auditor, maintainer, adversarial, treasury, ops, assetId) -> void  // admin bootstrap
```

**Split math (no rounding):** USDC = 6 decimals → $0.001 = **1000 µUSDC**. `500 + 200 + 150 + 100 + 50 = 1000` exactly. No remainder handling for the fixed demo unit. *If* you later parametrize the amount, route the integer remainder to treasury.

**Opt-in:** app account + all 5 recipients must opt into the USDC ASA before the demo. Automate in `setup.ts`. Never burn live demo time on opt-ins.

## 5. x402 flow

```
GET /:pkg/-/:tarball
  status < COMMUNITY_REVIEWED  → passthrough npm, 200 + tarball                (FREE TIER)
  status >= COMMUNITY_REVIEWED → 402 with PaymentRequirements:
        { scheme:"exact", network: ALGORAND_TESTNET_CAIP2,
          payTo: <APP_ADDRESS>, asset: "10458941",
          maxAmountRequired:"1000", maxTimeoutSeconds:60,
          extra:{ name:"USDC", decimals:6, appMethod:"pay", args:[pkg,ver] } }
  → client builds atomic group [USDC axfer→app, appcall pay(pkg,ver)], signs, encodes header
  → GET retry with X-PAYMENT header
  → proxy verifies+settles, waits confirmation, 200 + tarball + X-AUDIT-ATTESTATION
```

**Settlement path:**
- **A (preferred):** GoPlausible hosted facilitator via `HTTPFacilitatorClient` + `registerExactAvmScheme`. Timebox ~90 min.
- **B (fallback):** proxy submits the signed group directly with `algosdk` + `waitForConfirmation`. **Decide by hour 3.** Full demo survives either way.

## 6. Data model

```sql
CREATE TABLE audit_status (
  pkg TEXT, version TEXT, status TEXT,        -- UNREVIEWED|AUTO_SCANNED|COMMUNITY_REVIEWED|PEER_REVIEWED
  auditor_addr TEXT, attest_txid TEXT, ts INTEGER,
  PRIMARY KEY (pkg, version)
);
```
Seed: 1 package `COMMUNITY_REVIEWED` (paid path, pinned e.g. `lodash@<ver>`), 1–2 `UNREVIEWED` (free path). This is the two-branch demo story.

## 7. Status semantics (subset)

Implement only: `UNREVIEWED` (default/free), `AUTO_SCANNED` (free), `COMMUNITY_REVIEWED` (paid), `PEER_REVIEWED` (paid). Skip `MISSION_CRITICAL_SAFE`, `CVE_KNOWN`.
**Implement the auto-reset rule** (new version → `UNREVIEWED`): cheap, and a strong narrative beat ("that's exactly where supply-chain attacks inject").

## 7a. Audit lifecycle (how a package becomes paid)

1. Unknown/new version → proxy synthesizes `UNREVIEWED` (free).
2. Auditor calls `SplitRouter.attest(pkg, ver, status)` — contract asserts
   `Txn.sender == authorizedAuditor` and writes box `attest:<pkg>@<ver>` (source of truth).
3. Proxy mirrors status into SQLite (`COMMUNITY_REVIEWED` + auditor_addr + attest_txid).
4. Install reads SQLite → `>=COMMUNITY_REVIEWED` triggers 402 → payment → 200 + `X-AUDIT-ATTESTATION`.
5. Version bump → no row → `UNREVIEWED` again.

**Demo:** seed steps 1–3 (DB row, optionally the attest box) so the paid install is the
live on-chain moment. A live `attest()`→status-flip is an optional stronger beat.

**Auditor identity (MVP):** an Algorand address registered as `authorizedAuditor` in
contract global state at deploy. No GPG, no reputation scoring (full-vision; deferred).

**Adoption ("no migration"):** consumers set `.npmrc` `registry=<proxy>` or
`npm install --registry <proxy>`; the overlay sits in front of npm, free installs are
byte-identical. MCP/CLI target the proxy URL.

> **Split note:** canonical revenue split is **50/20/15/10/5** (five-way). The original
> SPM doc also contains a stale **70/20/10** three-way variant — ignore it; use five-way.

## 8. Quantoz EURD bonus (conditional)

The split contract is currency-agnostic — denomination is just which ASA the requirements name and which the 5 recipients opt into. To claim the bonus:
- Parametrize `ASSET_ID` on the contract (already in `setRecipients`).
- Add a second route / second `accepts` entry priced in EURD using `@ever_amsterdam/x402-euro-eurd` patterns (Quantoz x402 guide).
- Opt the 5 recipients into the EURD ASA too.

Berlin team + EU-compliance framing makes EUR-denominated audit micropayments a coherent story, not a bolt-on. **If it isn't clean in 30 min, ship single-track.**

## 9. Track mapping

| Track | SPM hook |
|---|---|
| **Agentic Commerce (primary)** | MCP tools an agent calls and pays for autonomously; pay-per-use install; no OAuth/subscription. Exactly the hackathon's "agent tool endpoints" + "payment-gated MCP tools" patterns. |
| **Quantoz (bonus, conditional)** | Same SplitRouter, EURD-denominated micropayment via the EURD x402 package. |

(Folks Finance / Alpha Arcade: no clean fit — one-line stretch in pitch at most, no build.)

## 10. Demo script (~90s)

1. Agent calls `check_audit_status(pkg)` on an unreviewed pkg → free `install` → instant (free-tier proof).
2. Agent calls `install_audited_package("lodash", "<ver>")` → 402 → agent signs+pays autonomously → **show Lora**: one group txn, five inner transfers of exactly 500/200/150/100/50 µUSDC. Tarball installs.
3. `curl /api/v1/status/lodash/<ver>` → machine-readable status + attestation txid.
4. Close: "bump the version → status resets to UNREVIEWED → new bounty. That's the injection point."

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Facilitator integration cost | Path B (direct algosdk submit). Decide by hr 3. |
| Recipient opt-in time | Fully automated in `setup.ts`, run pre-demo. |
| Agent writing stale AVM code | Load Algorand DevRel agent skills into Claude Code before hr 0 (neutralizes TS/AVM drift). |
| TestNet flakiness on stage | Record a backup video of the full E2E run. |
| Scope creep / multi-track drift | `scope-sentinel` subagent + hard "out of scope" list above. |

## 12. Sync points

hr1 proxy passthrough proven · hr3 facilitator go/no-go · hr8 SplitRouter on TestNet + ABI handed to proxy dev · hr10 full agent→pay→split→install E2E.

> Per-sprint two-dev task breakdown lives in `PLAN.md` (written next).
