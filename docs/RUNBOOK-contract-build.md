# Runbook — regenerate the SplitRouter artifacts

**Status: REQUIRED before any MainNet deploy. Not done.**

Run this on a machine with Docker and the AlgoKit CLI. The session that
reworked the contract had neither, so it could not compile the contract or run
LocalNet.

---

## 1. Why this is needed

`contracts/smart_contracts/split_router/contract.algo.ts` changed substantially.
The generated artifacts in `contracts/smart_contracts/artifacts/split_router/`
still describe the old contract. They are stale, not merely out of date.

The ABI drift is total, not cosmetic:

| Method | Committed artifacts | Current source |
|---|---|---|
| `setRecipients` | present | unchanged |
| `optInToAsset` | present | **changed** — opts in `payTo`, not the app address |
| `attest` | `(string,string,uint64)` | `(string,string,uint64,string)` — gained `integrity` |
| `pay` | `(axfer,string,string)` | **removed** |
| `setPayTo` | absent | **added** |
| `distribute` | absent | **added** |
| `releaseAuthority` | absent | **added** |
| `setAttestationKey` | absent | **added** |

After the build, the ABI must list exactly these seven methods:

```
setPayTo setRecipients optInToAsset distribute attest releaseAuthority setAttestationKey
```

WARNING: `optInToAsset` changed behaviour without changing its signature, so
the ABI alone will not reveal a stale build of it. Confirm the regenerated
TEAL comes from the current source, not just that the method names match.

WARNING: the unit tests run under `@algorandfoundation/algorand-typescript-testing`,
which executes the contract as JavaScript. Passing tests do **not** prove the
contract compiles under Puya, and they do not prove it runs on the AVM. That
proof only comes from this runbook.

`contracts/smart_contracts/split_router/deploy-config.ts` imports
`SplitRouterFactory` from the generated client. It will not deploy the new ABI
until the client is regenerated.

## 2. Prerequisites

1. Start Docker. LocalNet runs inside it.
2. Install the AlgoKit CLI, version 2.6.0 or newer. `contracts/.algokit.toml`
   sets that minimum.
3. Install dependencies from the repository root with `pnpm install`.
   CAUTION: use pnpm. Never use npm or yarn in this repository.

## 3. Build

```bash
cd contracts
algokit project run build
```

Run it from `contracts/`. The repository root has no `.algokit.toml`, so there
`algokit` reports `No such command 'build'`. The command calls `pnpm run build`,
so `pnpm` must be on `PATH`, and `pnpm install` must have run first. Without the
install, `puya-ts` cannot resolve `@algorandfoundation/algorand-typescript`.

That runs two steps, both defined in `contracts/package.json`:
1. `algokit compile ts smart_contracts --output-source-map --out-dir artifacts`
2. `algokit generate client smart_contracts/artifacts --output {app_spec_dir}/{contract_name}Client.ts`

## 4. Verify the build

```bash
# The new ABI must appear, and pay() must be gone.
node -e "const j=require('./smart_contracts/artifacts/split_router/SplitRouter.arc56.json'); console.log(j.methods.map(m=>m.name).join('\n'))"
```

Expect exactly: `setPayTo`, `setRecipients`, `optInToAsset`, `distribute`,
`attest`, `releaseAuthority`, `setAttestationKey`.
WARNING: if `pay` still appears, the build did not run. Do not continue.

Then, from the repository root:

```bash
pnpm typecheck          # deploy-config.ts must compile against the new client
pnpm -C contracts test  # 16 tests must still pass
bash scripts/guard.sh   # must exit 0
```

## 5. What may fail, and what it means

These constructs are new and are the likely failure points. Each one is correct
by the specification, so a failure means the implementation needs adjusting, not
that the design is wrong.

- **`asset.balance(payToAcct)` at `contract.algo.ts:131`.** The AVM can only read
  an asset holding when both the account and the asset are available to the
  call. If Puya or the AVM rejects it, the caller must pass the account and the
  asset as foreign references in the application call. Fix the deploy or call
  script, not the invariant.
- **Inner transfers with `sender: payToAcct` at lines 148 to 176.** An
  application can only spend from an account rekeyed to it. This succeeds when
  `payTo` is the application address, and when `payTo` is a plain account
  rekeyed to the application. It fails otherwise.
- **`itxn.payment({ rekeyTo })` at line 215, inside `releaseAuthority`.** Verify
  the rekey actually clears the application's authority on LocalNet.
- **`Txn.fee` at line 135.** Confirm the fee-pooling assertion behaves as
  expected. Submit `distribute()` with a pooled fee below 6,000 microALGO and
  confirm it rejects.
- **Five inner transactions in one group.** Well within the AVM limit of 16.
  Confirm the opcode budget still holds once compiled.

## 6. Rehearse on LocalNet before MainNet

```bash
algokit localnet start
algokit project deploy localnet
```

Then exercise the real behaviour, which the JavaScript harness cannot:

1. Fund the application's `payTo` with a test ASA.
2. Call `distribute()`. Confirm five inner asset transfers appear on chain.
3. Confirm the amounts split 50/20/15/10/5 and sum exactly to the divisible
   portion.
4. Confirm dust below 1,000 micro-units stays behind for the next call.
5. Call `distribute()` below the 100,000 micro-unit floor. Confirm it rejects.

CAUTION: the JavaScript test harness does not move value. Its inner-transaction
emulation never mutates ledger balances, so the "dust remains" assertions are
arithmetic. LocalNet is the first place real balances move.

## 7. The payTo decision still needs a TestNet rehearsal

Specification section 8 leaves one item open. Rehearse it on TestNet before
MainNet, in this exact order:

1. Opt the `payTo` account into USDC.
2. Rekey that account to the application.
3. Confirm the application can still issue inner transfers from it.

WARNING: the order is not reversible. A rekeyed account cannot sign its own
asset opt-in, and the application cannot opt it in before the rekey exists.
Getting this backwards on MainNet strands the address and forces a new `payTo`.
After the first settled payment, a new `payTo` restarts the competition
leaderboard entry at zero.

## 8. After a successful build

Commit the regenerated artifacts. They are tracked on purpose, so that a
reviewer can diff the compiled output against the source.

```bash
git add contracts/smart_contracts/artifacts
git commit -m "Regenerate SplitRouter artifacts for the new ABI"
```

## 9. Do not

- Do not hand-edit the generated TEAL, the ARC-32 or ARC-56 specification, or
  the typed client. Regenerate them.
- Do not weaken a contract assertion to make the compiler or a test pass.
- Do not deploy to MainNet until step 4, step 6 and step 7 all pass.
