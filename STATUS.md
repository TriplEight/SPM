# Implementation status — v3 specification

Generated during the orchestration run of 2026-09-19 and 2026-09-20. Every
result below was verified by the orchestrator running the acceptance check
itself, not by accepting a work item's self-report.

## Per-item result

| Item | Scope | Result | Retries | Subagent tokens |
|---|---|---|---|---|
| W0 | Research the installed x402 middleware | DONE | 0 | 110,049 |
| W1 | Remove the EURD path from the MCP server and CLI | DONE | 0 | 49,932 |
| W2 | SplitRouter: `distribute()`, drop `pay()`, bind integrity | DONE | 1 | 168,056 |
| W3 | Proxy migration to the x402 middleware | DONE | 1 blocked, 1 retry | 257,792 |
| W4 | DSSE attestation signing | DONE | 0 | 69,003 |
| W5 | Attestation routes, lockfile and single package | DONE | 1 (W5b) | 189,510 |
| W5b | Integrity binding, free single-attest tier | DONE | 0 | 123,019 |
| W6 | Claims ledger, accrual, reconciliation, payout script | DONE | 0 | 222,009 |
| W6b | Mount the ledger middleware and routes | DONE | 0 | 120,096 |
| W7 | `spm verify`, offline level-1 verification | DONE | 0 | 66,814 |
| W8 | `spm-attest` CI action | DONE | 0 | 86,508 |
| W9 | MCP payer on MainNet | DONE | 0 | 217,674 |
| W13 | Boot guard at startup, dead suppression removed | DONE | 0 | 59,802 |
| WH1 | Biome, invariant guard, git hooks, CI, gate alignment | DONE | 3 | 256,055 |

Approximate subagent spend: 2,000,000 tokens across 14 items and 6 retry rounds.
Orchestrator spend is not included.

## Verified state

| Check | Result |
|---|---|
| proxy tests | 142 |
| cli tests | 8 |
| contracts tests | 7 |
| mcp tests | 5 |
| Action tests | 6 |
| `pnpm typecheck` | passes |
| `scripts/guard.sh` | clean |
| `pnpm exec biome ci .` | exit 0, one warning |

## Defects found and fixed during verification

- **A fabricated field in a paid security attestation.** The lockfile analyser
  treated "no known-good hash to compare" as "the hash matched", so every
  reviewed package carried a signed `integrityMatch: true` without any
  comparison. No integrity value was stored anywhere. Fixed in W5b: the store
  now holds an integrity value, and a review record without one resolves to
  `UNREVIEWED`. If SPM cannot say which tarball a human read, it must not sell
  a claim about one.
- **A subject digest bound to nothing.** The single-package statement set
  `sha512: ''`, so a verifier had no artifact to check it against. It now
  decodes from the stored integrity.
- **The single-attest route charged for unreviewed packages**, contradicting
  specification line 567 and invariant 4. The specification won.
- **The boot guard ran on the first request, not at startup.** A misconfigured
  facilitator produced a server that bound the port, looked healthy, and failed
  a paying caller. Verified fixed by running the real process: a dead
  facilitator exits 1 and never binds; a valid one binds and logs the fee payer.
- **`distribute()` rounding granularity.** The acceptance numbers scaled the
  specification's dust figure along with the amount, silently changing the
  rounding unit from 1,000 to 100,000 microUSDC. The contract work item
  reported the contradiction instead of implementing it.
- **Two lint gates disagreed.** The pre-commit hook ran `biome check` on staged
  files; CI ran the stricter `biome ci` on everything, and 17 files failed. A
  gate that passes what the next gate rejects manufactures false confidence.
  Both now run `biome ci .`.
- **A frozen-lockfile install produced no native SQLite binding.** The build
  allowlist sat in a file pnpm never reads. CI would have failed on its first
  run.
- **Guard rule scope.** Two invariant rules matched a keyword rather than the
  invariant, firing 28 times on correct documentation and correct tests. An
  auditable `guard-allow` marker now covers the single deliberate exception.

## Open items, recorded rather than hidden

- **Specification section B5 is wrong about the 402 body.** Payment
  requirements arrive in the `PAYMENT-REQUIRED` header; the JSON body is `{}`.
  The check as written would read a false negative on qualification day.
- **Two facilitator checks disagree on `x402Version`.** `resolveFeePayer`
  accepts a supported-kind that omits it; the middleware's route validation
  requires it. Both failures happen before the port binds, so behaviour is
  correct, but the error text would mislead.
- **`scripts/e2e.mjs` counts passing checks but never prints the count.** This
  is the one remaining Biome warning. It reads as an unfinished summary line
  rather than dead code, so it was reported rather than renamed away. Printing
  the count would change script output, which is a decision for a human.
- **The reconciliation job has no production runner.** `proxy/src/claims/reconcile.ts`
  is implemented and tested against an injectable indexer client, but nothing
  schedules it.
- **A Biome configuration quirk.** Adding an `overrides` block to
  `biome.json` 2.5.14 breaks the top-level `files.includes` exclusion, so the
  generated contract artifacts start being reformatted. Per-line
  `biome-ignore` comments are used instead. Re-test before adding overrides.

## Review-fix round (2026-09-20)

Every result below was verified by the orchestrator running the check, not by
accepting a work item's self-report.

| Item | Scope | Result |
|---|---|---|
| F1 | Claim hijack: bind proof owner to identity | DONE |
| F2 | Action credential exposure: remove wallet-secret | DONE |
| F3 | Reviewer identity, tarball ledger, path and rate-limit bypasses | DONE, 1 retry |
| F4 | Contract: make `releaseAuthority` reachable | DONE |
| F5 | MCP settlement txid header | NOT STARTED |
| F6 | Per-file SQLite isolation in the proxy tests | DONE |
| F7 | Pin the payTo rejection assertions | DONE |
| CI | Run the cli and action suites in CI | DONE |

### Defects the orchestrator found by its own probes

- **A claim hijack.** `verifyClaim` took the identity and the proof
  independently. An attacker published a proof under an account they owned and
  took over another identity's claim, and every future payout with it.
- **A credential leak in the CI Action.** `attest.mjs` forwarded the caller's
  wallet secret as a header to whatever host the `endpoint` input named.
- **The first path-encoding fix broke invariant 4 the other way.**
  `parseTarballPath` decoded `%40` and `%2f`. `isTarballPath` still tested the
  raw path. A caller who also encoded the `/-/` separator skipped the free-tier
  hook, and an unreviewed package returned 402. Caught by a negative control:
  the original table asserted only the 402 direction. Both functions now share
  `normalizeTarballPath`.

### Verified state

| Check | Result |
|---|---|
| proxy tests | 199 |
| contracts tests | 13 |
| mcp tests | 5 |
| cli tests | 8 |
| Action tests | 9 |
| `pnpm typecheck` | passes |
| `scripts/guard.sh` | clean |
| `pnpm exec biome ci .` | exit 0, zero warnings |

### Open

- **F5, the MCP settlement txid, is not started.** `mcp/src/tools/install.ts`
  reads `X-AUDIT-ATTESTATION`. Nothing sets that header. The only module that
  ever did was the deleted `proxy/src/settle.ts`. So `txid` is always null, and
  every paid install reports `status: 'free'` with no proof of payment. The
  correct source is the `PAYMENT-RESPONSE` header, decoded with
  `decodePaymentResponseHeader` from `@x402-avm/core/http`; read
  `decoded.transaction` when `decoded.success` is true.
  `proxy/src/claims/middleware.ts` already consumes it that way.

### Defect found while verifying, now fixed

- **The proxy test suite raced itself on one SQLite file.** `proxy/src/db.ts`
  resolves its path once, at module load, and falls back to `proxy/audit.db`.
  Nine test files opened that one file, in parallel vitest workers.
  `app.test.ts` and `status.test.ts` each truncated `audit_status` in a
  `beforeEach`, so one file's truncation could land between another file's seed
  and its assertion. The suite passed because the window was small. It was
  flaky by construction, and it destroyed a developer's local `audit.db` on
  every run.

  Every proxy test file now takes a unique temporary database, the pattern the
  four `proxy/src/claims` files already used. `index.test.ts` was the file that
  actually created the database: it spawns a subprocess, so it sets
  `SQLITE_PATH` in the child's environment.

  The rule is absolute rather than conditional: no proxy test opens
  `proxy/audit.db`. Verified by deleting the file, running the suite, and
  confirming it is not recreated. 199 tests, unchanged.

- **Four contract rejection assertions were hollow.** The `setPayTo` and
  `releaseAuthority` tests used a bare `.toThrow()`, which passes on any error.
  Each now pins its own assert message. Verified by negative control: an
  expected message the contract never emits fails the test.

### HTTP-level coverage gap

The encoded-`/-/` case is asserted at hook level in
`proxy/src/x402/tarball.test.ts`, for both the reviewed and the unreviewed
direction. The two HTTP-level tables in `proxy/src/app.test.ts` stop at the
encoded scope separator and omit that row. Add it to both tables.

## Review rounds (2026-09-20 / 21)

Three code reviews ran after implementation. Each found defects the test suite
did not. Every fix below was verified by the orchestrator running its own
probe, not by accepting a work item's report.

### Round 1 — 10 findings, all fixed

Claim hijack (proof owner not bound to identity). Wallet secret forwarded by
the CI Action to an arbitrary host. Auditor share accrued to an unclaimable
identity. Tarball revenue never ledgered. Rate limit bypassable via
`X-Forwarded-For`. Lockfile integrity fabricated. CI ran only three of five
suites. `releaseAuthority` unreachable. MCP read a header nothing set.

### Round 2 — 7 findings, all fixed

Duplicate-slash paywall bypass (a reviewed tarball served free, 318,961 bytes
measured). `spm verify` printed PASS for a digest check it skipped.
`demo.sh` announced TestNet then paid on MainNet. Anyone could reset a
verified claim and block payouts. The 5 MB body cap bounded nothing.
`x-real-ip` still bypassed the rate limit. Signed summary buckets did not sum.

### Round 3 — 8 findings, 7 fixed, 1 deferred to a human

A truncated integrity sold as a real sha512 digest. A genuine match reported
as `INTEGRITY_MISMATCH` because SSRI multi-hash failed a byte-for-byte compare.
`setPayTo` unrecoverable. `optInToAsset` opted in the wrong account, which
would have failed every payment under variant B. Payout address unvalidated.
Discovery example did not sum. Printed demo used HEAD, which is never gated.
A flaky test fixture. The stale artifacts remain open; see below.

### The defect class worth remembering

The tarball path check broke four times: `%40`, then `%2F` and an encoded
`/-/`, then duplicate and trailing slashes, then a case-sensitive `.tgz`
against a case-insensitive route key. The first three were spelling problems,
closed by adding rules to a hand-rolled decoder. Each left the next spelling
open.

The fourth was different: two predicates of different width decided the same
question, and the free-tier hook's was narrower than the payment gate's.

The fix is structural, not another rule. `normalizeTarballPath` replicates the
installed matcher's own steps, and `isTarballRouteScope` mirrors the route key
exactly. A path the gate protects but the hook cannot resolve is granted free,
because an unresolvable path can never be a reviewed tarball.

WARNING: any future change to the route key must change both, or the gap
reopens.

### Fake test fixtures hid two defects

`sha512-abc` decodes to two bytes and was used as a reviewed package's
integrity. A placeholder string was used as an Algorand address. Both passed
until validation tightened, then three tests failed at once.

A `MALFORMED_APP_ADDRESS` fixture flipped the last base32 character, which
carries only padding bits, so it stayed valid on 14% of runs, measured over
500 addresses. The suite was red on those runs.

CAUTION: a fixture that does not look like real data stops testing the real
path. Fixtures that must be invalid now assert their own invalidity at load.

### Verified final state

| Check | Result |
|---|---|
| proxy tests | 306 |
| contracts tests | 16 |
| mcp tests | 8 |
| cli tests | 16 |
| Action tests | 9 |
| `pnpm typecheck` | passes |
| `scripts/guard.sh` | clean |
| `pnpm exec biome ci .` | exit 0, zero warnings |
| `bash scripts/verify.sh` | `VERIFY: PASS`, e2e SKIP pending network |

## Known limitations of this environment

- **No AlgoKit CLI and no Docker.** The contract cannot be compiled with Puya
  and LocalNet cannot run. Contract tests execute in JavaScript under
  `algorand-typescript-testing`. CAUTION: `contracts/smart_contracts/artifacts/`
  is stale. The committed ARC-56 specification still lists `pay()` and lacks
  `distribute()`, so it does not describe the contract in this repository.
  **Follow `docs/RUNBOOK-contract-build.md` on a machine with Docker and the
  AlgoKit CLI.** It is a blocker for any MainNet deploy.
- **The test harness does not move value.** Its inner-transaction emulation does
  not mutate ledger asset balances, so the remaining-dust assertions are
  arithmetic rather than a post-call balance read.
- **No MainNet credentials, no funded wallet, and no public domain.** Every
  on-chain and hosting item stays with a human.

## Not started

W10 README rewrite, W11 verification harness update, W12 specification
corrections.

## Items no subagent can close

P0 payer recruitment, B1 MainNet provisioning, B3 public hosting, B6 the first
real payment, C2 the human package reviews, the section 4.2 hit-rate
measurement, and the D-phase submissions.
