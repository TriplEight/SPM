# SQLite is the status store and the ledger

The MVP runs one proxy process on one host, with one writer. It stores 15–30 human reviews and
a small accrual ledger. SQLite (`better-sqlite3`) already holds both and is tested, so it stays.
We considered PostgreSQL 16 with Drizzle, and rejected it for the MVP: it adds a database
container, a test container and a rewrite, and it solves no problem that the MVP has. The chain
cannot be the only store, because a settlement is a plain USDC transfer that does not say which
package it paid for (ADR 0002). The trigger to move to PostgreSQL is a second proxy instance.
Redis is not planned.

## Consequences

- The ledger file is the only record of payment-to-auditor attribution before a credit batch.
  The nightly job writes a `VACUUM INTO` copy and moves it off the host before it credits.
- Money columns are `INTEGER` micro-units. Never `REAL`.
