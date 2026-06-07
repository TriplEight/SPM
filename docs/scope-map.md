# SPM scope map, glossary & lifecycle (imported into project memory)

## One-paragraph why (so micro-decisions land right)
npm has no identity, no security review, no accountability — supply-chain attacks
(Axios, xz, Lazarus) are cheap to run. Meanwhile OSS maintainers are unfunded because
usage no longer drives engagement/donations. SPM funds *human* security review as a
public good: audited packages cost a tiny usage-triggered micropayment, split on-chain
to the people who did the work. The hackathon proves ONE mechanic end-to-end: an agent
autonomously pays an x402 micropayment to install an audited package, and five parties
get paid in one atomic transaction.

## Glossary
- **Overlay / proxy** — an npm-compatible registry in front of npmjs. Adopt by pointing
  npm at it (`registry=`); no migration, packages resolve normally.
- **Audit status** — machine-readable, per-version flag on a package (see tiers below).
- **Auditor** — a human (identified by an Algorand address) who signs an attestation that
  a specific package version was reviewed. Earns 50% of that version's micropayments.
- **Adversarial reviewer** — secondary reviewer who finds flaws in existing audits. Earns
  15%. (MVP: just a recipient slot; no review UX is built.)
- **Maintainer** — the package author; earns 20% for keeping code auditable. (MVP: a
  recipient slot.)
- **Attestation** — the signed record that an audit happened. On-chain in MVP = a box
  entry on SplitRouter keyed `attest:<pkg>@<ver>`. (Full vision = ARC-19 NFT — deferred.)
- **x402** — HTTP 402 payment protocol; server returns payment requirements, client pays,
  retries with a payment header. On Algorand via `@x402-avm/*`.
- **SplitRouter** — our AVM app: receives the USDC payment, fans it out 50/20/15/10/5.

## Audit status tiers (MVP subset)
UNREVIEWED (default, FREE) -> AUTO_SCANNED (FREE) -> COMMUNITY_REVIEWED (PAID) ->
PEER_REVIEWED (PAID). Skipped for MVP: MISSION_CRITICAL_SAFE, CVE_KNOWN:[id].
Payment triggers at COMMUNITY_REVIEWED and above. Everything below is free.

## Audit lifecycle (THE thing that was under-specified — build to this)
1. **Publish / unknown version** -> status defaults to `UNREVIEWED` (free). The proxy
   synthesizes UNREVIEWED for any version it has no row for (auto-reset rule).
2. **Auditor reviews** -> calls `attest(pkg, ver, status)` on SplitRouter. The contract
   asserts the sender is a registered auditor and writes box `attest:<pkg>@<ver>` =
   {auditor, txid, status, ts}.
3. **Proxy syncs** -> on attest (or via a small sync/seed step) the proxy upserts the
   SQLite `audit_status` row to `COMMUNITY_REVIEWED` with auditor_addr + attest_txid.
   SQLite is the hot-path read; the box is the source-of-truth attestation.
4. **Install** -> proxy reads SQLite. >= COMMUNITY_REVIEWED => 402 => payment => 200 +
   `X-AUDIT-ATTESTATION` (the box value / attest txid).
5. **Version bump** -> new version has no row -> back to UNREVIEWED -> new review needed.
   (Narrative: that gap is exactly where supply-chain attacks inject.)

**Demo shortcut:** seed step 1-3 directly — insert the SQLite row AND (optionally) write
the attest box — so the install in step 4 is the live, paid, on-chain moment on stage.
Showing a live `attest()` -> status flip is a strong *optional* extra (MCP `submit_audit`
tool or `spm audit`), but the required demo is the paid install + 5-way split.

## Auditor identity (MVP — concrete)
No GPG, no reputation scoring in MVP. Identity = an **Algorand address registered as an
auditor**. Simplest sufficient mechanism: an `authorizedAuditor` (or a small set) stored
in SplitRouter global state at deploy; `attest()` asserts `Txn.sender == authorizedAuditor`.
The seeded demo auditor's address is one of the 5 recipients (the auditor slot). Sybil
resistance (1 wallet per reviewer, stake-weighted reputation) is the full-vision story —
deferred; state it in the pitch, do not build it.

## Full vision -> MVP substitute (do NOT rebuild the left column)
| Full SPM | MVP build | Why |
|---|---|---|
| PostgreSQL + Drizzle + Redis | SQLite single table | 12h; status store is tiny |
| ARC-19 NFT attestation | SplitRouter box entry | NFT minting is scope; box proves the point |
| GPG + Algorand wallet identity | Algorand address only, sender-gated attest | identity that pays = identity that signs |
| On-chain auditor registry + reputation | 1 authorizedAuditor in global state | enough to gate attest() and route the 50% |
| Bounty subsidy pool (treasury auto-disburse) | treasury is just a recipient slot | no disbursement logic in 12h |
| CodeQL/OSV AUTO_SCANNED tier | tier exists in enum; no scanner wired | scanning is its own project |
| GitHub Action / Dependabot / Renovate | none | not on the demo path |
| Stripe enterprise pre-funding | none | agent pays directly from a funded wallet |
| Multi-language registries | npm/JS only | one ecosystem proves the overlay |
| `spm register` / `spm audit` CLI | optional; install + status are required | seed covers status for the demo |
| 70/20/10 split (stale doc variant) | **50/20/15/10/5** | five-way is canonical |
| ~$0.01 (old figure) | **$0.001 = 1000 µUSDC** | matches current doc + x402-avm units |

## Bonus track (conditional)
Quantoz EURD: same SplitRouter with a second ASA + recipient opt-ins + a EURD-priced
route (`@ever_amsterdam/x402-euro-eurd` patterns). Only if S4 is green and it's <=30 min.
