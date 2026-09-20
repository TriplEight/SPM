# Implementation status — v3 specification

Generated during the orchestration run of 2026-09-19. Every result below was
verified by the orchestrator running the acceptance check itself, not by
accepting a work item's self-report.

## Per-item result

| Item | Scope | Result | Retries | Subagent tokens |
|---|---|---|---|---|
| W0 | Research the installed x402 middleware | DONE | 0 | 110,049 |
| W1 | Remove the EURD path from the MCP server and CLI | DONE | 0 | 49,932 |
| W2 | SplitRouter: `distribute()`, drop `pay()`, bind integrity | DONE | 1 | 168,056 |
| W3 | Proxy migration to the x402 middleware | DONE | 1 blocked, 1 retry | 257,792 |
| W4 | DSSE attestation signing | DONE | 0 | 69,003 |
| W7 | `spm verify`, offline level-1 verification | DONE | 0 | 66,814 |
| W8 | `spm-attest` CI action | DONE | 0 | 86,508 |
| W9 | MCP payer on MainNet | DONE | 0 | 217,674 |
| WH1 | Biome, invariant guard, git hooks, CI | DONE | 2 | 159,038 |

Approximate subagent spend: 1,185,000 tokens across 9 items and 4 retry rounds.
Orchestrator spend is not included.

Test totals: 45 proxy, 8 cli, 7 contracts, 5 mcp, 6 action. Typecheck passes.
The invariant guard is clean.

## Not started

W5 attestation routes, W6 claims ledger, W10 README and hygiene, W11 harness
scripts, W12 specification update.

## Open defects found but not yet fixed

- **Specification section B5 is wrong about the 402 body.** Payment requirements
  arrive in the `PAYMENT-REQUIRED` header, not the JSON body, which is `{}`.
  The check as written would read a false negative on qualification day.
- **Two facilitator checks disagree on `x402Version`.** `resolveFeePayer`
  accepts a supported-kind that omits `x402Version`. The payment middleware's
  route validation requires it. A facilitator response missing that field
  therefore passes the boot guard and then fails route validation, with a
  message saying the facilitator does not support `exact`. Both failures happen
  before the port binds, so the behaviour is still correct, but the error text
  would mislead whoever reads it. Found while verifying the boot guard.

## Fixed after first report

- **The boot guard now runs at startup** (W13). `proxy/src/index.ts` awaits
  `boot()` before `serve()`, and the lazy default export is deleted rather than
  left beside the new path. Verified by running the real process: a dead
  facilitator exits 1 and never binds the port; a valid facilitator binds the
  port and logs the resolved fee payer.
- **The dead suppression comment is removed** (W13). It named a rule that is not
  enabled, so it suppressed nothing.

## Verified evidence

- Contract: 7 tests pass. `distribute()` floors to 1,000 microUSDC, asserts a
  100,000 microUSDC minimum, asserts a 6,000 microALGO pooled fee, and emits
  five zero-fee inner transfers summing exactly to the divisible portion.
- Attestations: the pre-authentication encoding was re-derived independently by
  the orchestrator and matches the DSSE specification byte for byte. Signatures
  verify under raw ed25519. Tampered payloads and foreign keys are rejected. No
  `MX` prefix is present.
- CI action: exits 0 against a dead host and against a missing lockfile. Six
  tests pass, including an assertion that exactly one retry follows a 402.
- Dependencies: advisories against direct dependencies fell from 17 to 0.
  43 transitive advisories remain, including one critical in `tar` beneath the
  Puya compiler chain. It is build-time only and is not reachable at runtime.

## Corrections the orchestrator made to its own instructions

- **`distribute()` rounding granularity.** The acceptance numbers scaled the
  specification's dust figure along with the amount. That silently changed the
  rounding unit from 1,000 to 100,000 microUSDC and would have parked up to
  $0.10 of undistributable dust. The contract work item reported the
  contradiction instead of implementing it. Corrected.
- **Guard rule scope.** Two invariant rules matched a keyword rather than the
  invariant. They fired 28 times on correct documentation and correct tests.
  Corrected, and an auditable `guard-allow` marker now covers the single
  deliberate exception.

## Known limitations of this environment

- **No AlgoKit CLI and no Docker.** The contract cannot be compiled with Puya
  and LocalNet cannot run. Contract tests execute in JavaScript under
  `algorand-typescript-testing`. CAUTION: `contracts/smart_contracts/artifacts/`
  is now stale. The committed ARC-56 specification still lists `pay()` and lacks
  `distribute()`, so it does not describe the contract in this repository.
  **Follow `docs/RUNBOOK-contract-build.md` on a machine with Docker and the
  AlgoKit CLI.** It is a blocker for any MainNet deploy.
- **The test harness does not move value.** Its inner-transaction emulation does
  not mutate ledger asset balances, so the remaining-dust assertions are
  arithmetic rather than a post-call balance read.
- **No MainNet credentials, no funded wallet, and no public domain.** Every
  on-chain and hosting item stays with a human.
- **GitHub write access is refused for this organization.** Commits are local.
  The push returns HTTP 403 until the Claude GitHub App is installed on the
  repository, or GitHub is reconnected from claude.ai settings.

## Items no subagent can close

P0 payer recruitment, B1 MainNet provisioning, B3 public hosting, B6 the first
real payment, C2 the human package reviews, the section 4.2 hit-rate
measurement, and the D-phase submissions.
