---
name: spm-audit-status
description: >
  SPM audit-status model: the tier subset, the auto-reset rule, the SQLite
  schema, and the machine-readable status API. Use for the status store and
  the /api/v1/status endpoint.
---
# Audit status

## Tiers (MVP subset only)
UNREVIEWED       default on publish        FREE
AUTO_SCANNED     passed automated checks   FREE
COMMUNITY_REVIEWED  >=1 signed review      PAID (triggers x402)
PEER_REVIEWED    >=2 independent reviews   PAID
(Skip MISSION_CRITICAL_SAFE and CVE_KNOWN for the hackathon.)

Payment triggers for COMMUNITY_REVIEWED and above. Everything below is free.

## Auto-reset rule
A new package version starts at UNREVIEWED and must be re-reviewed. When the proxy
sees a version it hasn't recorded, default it to UNREVIEWED. This is a demo beat:
"the version bump is exactly where supply-chain attacks inject."

## Lifecycle (how a row gets its status)
1. Unknown version -> synthesize UNREVIEWED (free). Never store-then-block; just default.
2. Auditor calls SplitRouter.attest(pkg, ver, status) on-chain (box = source of truth).
3. Proxy mirrors that into this SQLite row: status=COMMUNITY_REVIEWED, auditor_addr,
   attest_txid. SQLite is the hot-path read; the box is canonical. (Demo: seed both.)
4. Install reads SQLite. >= COMMUNITY_REVIEWED -> 402. Else passthrough (free).
5. Version bump -> no row -> UNREVIEWED again. (See docs/scope-map.md for the full flow.)

## Storage (SQLite — no Postgres/Redis)
CREATE TABLE audit_status (
  pkg TEXT, version TEXT, status TEXT,
  auditor_addr TEXT, attest_txid TEXT, ts INTEGER,
  PRIMARY KEY (pkg, version)
);

## API
GET /api/v1/status/:pkg/:version
-> 200 { pkg, version, status, auditor_addr, attest_txid, ts }
-> unknown version => synthesize { status: "UNREVIEWED" } per the auto-reset rule.
