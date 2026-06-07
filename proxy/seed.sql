-- Demo seed data for SPM proxy
-- Run: sqlite3 audit.db < seed.sql

DELETE FROM audit_status WHERE pkg IN ('lodash', 'express', 'chalk');

INSERT OR REPLACE INTO audit_status (pkg, version, status, auditor_addr, attest_txid, ts)
VALUES (
  'lodash',
  '4.17.21',
  'COMMUNITY_REVIEWED',
  'AUDITOR_PLACEHOLDER_ADDR',
  'ATTEST_TXID_PLACEHOLDER',
  strftime('%s', 'now') * 1000
);
