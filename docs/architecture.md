# SPM Architecture (imported into project memory)

Flow: agent/CLI → Hono proxy. Proxy looks up audit status in SQLite.
- status < COMMUNITY_REVIEWED → transparent passthrough to registry.npmjs.org (FREE).
- status >= COMMUNITY_REVIEWED → 402 with x402 PaymentRequirements (exact/USDC/Algorand).
Client builds an ATOMIC GROUP: [USDC AssetTransfer -> app addr] + [appcall pay(pkg,ver)],
signs, sends X-PAYMENT header on retry. Proxy verifies+settles (GoPlausible facilitator,
or direct algosdk submit as fallback), waits confirmation, returns 200 + tarball +
X-AUDIT-ATTESTATION.

SplitRouter (ARC-4 app):
- pay(payment, pkg, ver): assert asset/receiver/amount; emit 5 inner axfers
  500/200/150/100/50 µUSDC; log pkg@ver + sender.
- attest(pkg, ver, status): sender-gated; write box attest:<pkg>@<ver>.
- setRecipients(...): admin bootstrap (5 addresses + asset id).

Pre-demo: app account + all 5 recipients opt into USDC ASA (10458941). Automated in
contracts/scripts/setup.ts. EURD bonus = same contract with a second ASA + opt-ins.

Status tiers (subset): UNREVIEWED(default,free) → AUTO_SCANNED(free) →
COMMUNITY_REVIEWED(paid) → PEER_REVIEWED(paid). Version bump auto-resets to UNREVIEWED.

API: GET /api/v1/status/:pkg/:version → { status, auditor_addr, attest_txid, ts }.

Adoption ("no migration"): consumers point npm at the proxy via `.npmrc`
`registry=<proxy-url>` or `npm install --registry <proxy-url>`. Packages resolve through
the overlay; free-tier installs are byte-identical to npm. The MCP/CLI just target the
proxy URL. For the demo the proxy is localhost.

Audit lifecycle and how on-chain attest() relates to the SQLite row: see
docs/scope-map.md ("Audit lifecycle"). Short version: attest() writes the box (source of
truth); the proxy mirrors status into SQLite for hot-path reads; install reads SQLite.
