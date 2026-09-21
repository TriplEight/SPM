---
name: spm-split-contract
description: >
  SplitRouter AVM contract: the permissionless distribute() fan-out of USDC that
  accrues at payTo, box attestation, admin methods, and the contract-test limits.
  Use when you read, edit, or test contracts/smart_contracts/split_router/.
---
# SplitRouter

Source: `contracts/smart_contracts/split_router/contract.algo.ts` (Puya-TS, ARC-4).
Build runbook: `docs/RUNBOOK-contract-build.md`.

## Money flow

WARNING: never split per payment. The facilitator accepts only a plain USDC
asset transfer to `payTo`. USDC accrues there. `distribute()` fans it out later.
Say "distributes atomically and permissionlessly". Never say "in the same transaction".

- `distribute()` is permissionless. Anyone can call it.
- It floors the balance to a multiple of `DIVISIBLE_UNIT` (1,000 microUSDC).
- It asserts the divisible portion is at least `MIN_DISTRIBUTE` (100,000 microUSDC).
- It asserts the outer fee is at least `MIN_DISTRIBUTE_FEE` (6,000 microALGO).
- Split per 1,000 microUSDC: auditor 500, maintainer 200, adversarial 150,
  treasury 100, ops 50. The sub-1,000 remainder stays in the account.

## Methods

| Method | Caller | Effect |
|---|---|---|
| `setPayTo(addr)` | creator | Sets payTo. Fails once payTo holds any USDC. |
| `setRecipients(...)` | creator | Stores the 5 recipients and the asset id. |
| `optInToAsset(asset)` | creator | Opts payTo into the asset. Without payTo set, opts the app account. |
| `distribute()` | anyone | Fans out the divisible USDC balance held at payTo. |
| `attest(pkg, ver, status, integrity)` | auditor | Writes the attestation box, binds integrity. |
| `releaseAuthority(to)` | creator | Rekeys a separate payTo account away from the app. After it, `distribute()` cannot move those funds. |
| `setAttestationKey(key)` | creator | Records the DSSE service public key. |

Every recipient must be opted into USDC 31566704 before `distribute()` runs.
`docs/HANDOFF-next-session.md` records the payTo variant decision.

## Tests

- Contract tests run under `@algorandfoundation/algorand-typescript-testing`, in JavaScript.
- CAUTION: they do not prove the contract compiles under Puya.
- CAUTION: inner transactions do not move ledger balances in that harness.
  Remainder assertions are arithmetic, not balance reads.
- After any contract change, a human runs `algokit project run build` and commits
  the regenerated artifacts under `contracts/smart_contracts/artifacts/`.
- Amounts are integer micro-units. Never use floats.
