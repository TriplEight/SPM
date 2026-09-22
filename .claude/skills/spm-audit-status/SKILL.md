---
name: spm-audit-status
description: >
  SPM audit-status model: the MVP tiers, the auto-reset rule, the integrity rule, the
  Postgres schema (Drizzle), and the machine-readable status API. Use for the status
  store and the /api/v1/status endpoint.
---
# Audit status

Spec: `SPEC.md` §4 (model), §12.4 (integrity), §13.1 (repo key), §14 (seeding).
Terms: `CONTEXT.md` (Tier, Flag, COMMUNITY_REVIEWED).

## Tiers (MVP builds two)
UNREVIEWED          default on publish                         FREE
COMMUNITY_REVIEWED  >=1 auditor read that exact tarball, signed PAID (triggers x402)

`AUTO_SCANNED` (Phase 2), `PEER_REVIEWED` and `MISSION_CRITICAL_SAFE` (Phase 3) are the
product model. Do not build them in the MVP. CVEs are flags (`cve:<id>`), never a tier.
Flags are Phase 2.

Payment triggers for COMMUNITY_REVIEWED and above. Everything below is free (invariant 4).

## Auto-reset rule
A new package version starts at UNREVIEWED and must be re-reviewed. The store keys on
(pkg, version), so a version with no row is UNREVIEWED. This is the demo beat:
"the version bump is exactly where supply-chain attacks inject."

## Integrity rule
A paid-tier row with no stored `integrity` is an incomplete review. It resolves to
UNREVIEWED. Without this rule a signed statement would report `integrityMatch: true`
having compared nothing.

## Lifecycle (how a row gets its status)
1. Unknown version -> synthesize UNREVIEWED (free). Never store-then-block; just default.
2. A human auditor reviews that exact tarball.
3. The operator runs `record-review` (TASK item 5). It fetches `dist.integrity` and the repo
   key from npm, asks for an interactive `yes`, writes the row, and calls
   PaymentRouter.attest(pkg, ver, status, integrity) signed by the auditor key.
   WARNING: only this tool writes a review row. Never in code, a fixture, or a seed
   script (CLAUDE.md invariant 5).
4. Install and attest routes read Postgres. >= COMMUNITY_REVIEWED with integrity -> 402.
   Else free.
5. Version bump -> no row -> UNREVIEWED again.

## Storage (PostgreSQL 16, Drizzle; replaces SQLite — TASK item 2)
audit_status (
  pkg          TEXT NOT NULL,
  version      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'UNREVIEWED',
  integrity    TEXT,          -- npm dist.integrity (sha512); null => resolves UNREVIEWED
  reviewer     TEXT,          -- bare GitHub login ("alice"), never "github:alice"
  repo         TEXT,          -- GitHub owner/repo, else npm:<name> (SPEC §13.1)
  review_scope TEXT,          -- e.g. full-source+install-scripts (SPEC §14)
  auditor_addr TEXT,
  attest_txid  TEXT,
  ts           BIGINT,        -- same unit as today's ts
  PRIMARY KEY (pkg, version)
)

## API
GET /api/v1/status/:pkg/:version
GET /api/v1/status/@scope/:pkg/:version   (scoped names; separate route)
-> 200 { pkg, version, status, integrity, reviewer, auditor_addr, attest_txid, ts }
-> unknown version => synthesize { status: "UNREVIEWED" } per the auto-reset rule.
