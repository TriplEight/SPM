---
name: spm-payment-router
description: >
  PaymentRouter AVM contract: USDC accrues at a payTo account rekeyed to the app, a
  crediter key credits auditor and ops balances per payment, payees claim, box
  attestation, admin methods, and the contract-test limits. Use when you read, edit,
  or test the PaymentRouter contract under contracts/smart_contracts/.
---
# PaymentRouter

Status: specified in `SPEC.md` §10.1–10.2 (v5). Built by `docs/TASK-testnet-readiness.local.md`
item 1. Expected source: `contracts/smart_contracts/payment_router/contract.algo.ts`
(Puya-TS, ARC-4). Build runbook: `docs/RUNBOOK-contract-build.md`.
Decisions: `docs/adr/0002-repo-pools-with-trusted-crediter.md`,
`docs/adr/0003-six-way-split.md`, `docs/adr/0004-payto-rekeyed-account.md`.

## Money flow

WARNING: never split per payment. The facilitator accepts only a plain USDC asset
transfer to `payTo`. The contract is not called at settlement. Never say "in the same
transaction". Never call `credit()` permissionless.

1. A donor pays through the facilitator. USDC lands at `payTo`, unallocated.
2. The crediter job calls `credit(settleTxid, total, entries)` with the crediter key.
3. The auditor and ops call `claim()`.

## payTo (Variant B)

- `payTo` is a plain account, not the app address.
- Order: `payTo` opts into USDC 31566704 FIRST, then it is rekeyed to the app.
  Never reverse this order. A rekeyed account cannot sign its own opt-in.
- Inner axfers use `sender = payTo`.
- `releaseAuthority(to)` hands `payTo` to a later contract. `payTo` never changes after
  the first USDC arrives. It is the leaderboard key.

## Split

- Target: 40 auditor / 10 contributor / 20 maintainer / 15 adversarial / 10 treasury / 5 ops.
- MVP on-chain: auditor 400, ops 600 per 1,000 microUSDC. The 60% is ops income.
- Every price is a multiple of 1,000 microUSDC, so `total × 400 / 1000` is exact.

## Methods

| Method | Caller | Effect |
|---|---|---|
| `credit(settleTxid, total, entries)` | crediter key only | `entries` = auditor `(repo, identity, amount)` list. Asserts sum(entries) == `total × 400 / 1000`. Credits each auditor balance per `(repo, identity)`; credits `total − sum` to ops. Rejects a repeated `settleTxid`. Rejects `total` above the unallocated balance of `payTo`. |
| `claim()` | mapped auditor address, or ops | Pays the whole balance. Requires balance ≥ `MIN_CLAIM` (100,000 microUSDC). Inner fee 0; asserts outer fee ≥ 2,000 microALGO (claimant pools the fee). |
| admin: map identity → address | admin | Maps an auditor identity (`github:<login>`) to an Algorand address opted into USDC. Name set in TASK item 1. |
| admin: set crediter key | admin | Authorises the crediter key. Name set in TASK item 1. |
| `attest(pkg, ver, status, integrity)` | auditor | Writes the attestation box. Binds `dist.integrity` (sha512). |
| `setAttestationKey(key)` | admin | Records the DSSE service public key. |
| `releaseAuthority(to)` | admin | Rekeys `payTo` away from the app. Disclose it publicly. |

The contract is amount-agnostic: it never asserts a fixed payment amount.

## Keys

- Crediter (`CREDITER_MNEMONIC`): hot, on the server, can call only `credit()`. Never the
  deployer, the admin, the donor or `payTo`.
- Deployer/admin (`DEPLOYER_MNEMONIC`): never on the server at runtime.
- Donor (`SPM_DONOR_MNEMONIC`): client-side only.
- Env: `PAY_TO_ADDRESS` (the rekeyed account), `PAYMENT_ROUTER_APP_ID`.

## Test vectors (SPEC §17 R0)

- Tarball payment 1,000 → auditor 400, ops 600.
- Lockfile payment 20,000 over 3 reviewed packages → auditor entries 2,668 / 2,666 / 2,666
  (remainder to the first in sort order), ops 12,000. One `credit()` call.
- Entries that do not sum to `total × 400 / 1000` → `credit()` fails.
- Repeated `settleTxid` → fails. `total` above the unallocated balance → fails.
- Balance 99,999 → `claim()` fails. 100,000 → succeeds.

## Tests

- Contract tests run under `@algorandfoundation/algorand-typescript-testing`, in JavaScript.
- CAUTION: they do not prove the contract compiles under Puya.
- CAUTION: inner transactions do not move ledger balances in that harness.
  Balance assertions after `claim()` are arithmetic, not balance reads.
- After any contract change, a human runs `algokit project run build` and commits
  the regenerated artifacts under `contracts/smart_contracts/artifacts/`.
- Amounts are integer micro-units. Never use floats.
