-- Demo seed data for SPM proxy
-- Run: sqlite3 audit.db < seed.sql

DELETE FROM audit_status WHERE pkg IN ('lodash', 'express', 'chalk');

-- Seeded reviews are real reviews (CLAUDE.md): the integrity below is the
-- actual npm-registry integrity for lodash@4.17.21, so this record can
-- honestly back a signed attestation. A row with no stored integrity is
-- treated as UNREVIEWED (status.ts's isReviewedWithIntegrity()).
--
-- `reviewer` carries the human reviewer's GitHub login, so the auditor's
-- 50% share accrues against an identity the ledger, the earnings endpoint,
-- and the payout script can all find (`github:<login>`) — `auditor_addr`
-- records a different fact, the on-chain attesting address, and is not
-- looked up by any of those.
INSERT OR REPLACE INTO audit_status (pkg, version, status, auditor_addr, attest_txid, ts, integrity, reviewer)
VALUES (
  'lodash',
  '4.17.21',
  'COMMUNITY_REVIEWED',
  'AUDITOR_PLACEHOLDER_ADDR',
  'ATTEST_TXID_PLACEHOLDER',
  strftime('%s', 'now') * 1000,
  'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==',
  'REVIEWER_PLACEHOLDER_LOGIN'
);
