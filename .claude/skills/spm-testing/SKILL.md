---
name: spm-testing
description: >
  SPM test stack, LocalNet fixtures, the verification harness, and how to assert the
  5-way on-chain split. Use whenever writing tests, the e2e/demo scripts, or wiring
  scripts/verify.sh — and before setting any /goal condition.
---
# Testing SPM

## Principle
"Done" = a command exits 0 with PASS in its output. Goal-mode's evaluator reads the
transcript, not the filesystem, so always run the check and let the result print.

## Where tests run
- Loop/dev on **LocalNet** (`algokit localnet start`) — instant + deterministic.
- **TestNet** only for the final E2E pass and the live demo (`scripts/demo.sh`).

## Stack
- contracts: vitest + @algorandfoundation/algokit-utils; deploy to LocalNet in beforeAll,
  fund test accounts, opt them into a locally-created USDC-like ASA.
- proxy: vitest + Hono `app.request()`; SQLite in a tmp file seeded per test.
- mcp/cli: vitest; spin the proxy + LocalNet app, drive the tools, assert built groups.

## Asserting the split (the key test)
After a pay() group is confirmed, read the txn's inner-transactions (algosdk
`pendingTransactionInformation` / indexer) and assert exactly 5 inner AssetTransfers with
amounts [500,200,150,100,50] to [auditor,maintainer,adversarial,treasury,ops]. Equivalent:
each recipient's ASA balance delta equals its share. Compare integer micro-units, never floats.

## Harness
- `scripts/verify.sh` — typecheck + `npm test` + LocalNet E2E; per-check PASS/FAIL; nonzero
  if any FAIL. This is the G4 goal condition.
- `scripts/e2e.mjs` — free install, paid install, on-chain split assert, status API,
  auto-reset. `--network localnet|testnet`. Prints `E2E: PASS|FAIL`.
- `scripts/demo.sh` — runs e2e on $NETWORK (default testnet), prints the Lora URL. G5 gate.
Stubs ship failing ("not implemented") so a /goal loop has a red target. Never weaken an
assertion to pass a goal — fix the code.
