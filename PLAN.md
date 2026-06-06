# SPM — Sprint Overview & Implementation Plan

Driven by Claude Code. Humans steer + review; the bottleneck is integration and
on-chain debugging, not typing — so the back half is integration-heavy by design.

## Roles
- **Dev B — Contracts & chain.** Owns `contracts/`, deploy, opt-ins, on-chain verify.
  Primary subagent: `algorand-contract-engineer`. On the **critical path** to hr8.
- **Dev A — Proxy, x402, MCP, CLI.** Owns `proxy/`, `mcp/`, `cli/`.
  Subagents: `x402-proxy-engineer`, then `mcp-payer-engineer`.
- Both invoke `scope-sentinel` before any sizable new piece, and `integration-tester`
  at sync points. Use `/handoff <summary>` after each block — it logs to `NOTES.md`.

## Key scheduling decisions (read first)
1. **Staggered start.** Dev B scaffolds the repo (`algokit init`, `bootstrap.sh`, first
   commit + push) while Dev A installs local prereqs in parallel. Then Dev A pulls.
2. **Dev A is never blocked on the real contract.** Build the proxy + MCP against a
   **mock SplitRouter on LocalNet** (hardcoded app id, pay() that just accepts the
   group). Swap to the real TestNet `APP_ID/ADDRESS/ABI` at the hr8 handoff.
3. **Facilitator is a flag, not a fork.** Implement direct `algosdk` submit (Path B) as
   the default-safe path; wire GoPlausible (Path A) behind `FACILITATOR_URL`. Decide
   which you demo at hr3 — never let it block.

## Sync points (definition of done)
- **S1 @ H1** — Proxy passes `npm install` through to npmjs; SplitRouter compiles on LocalNet.
- **S2 @ H3** — 402 round-trip works against the mock app; pay() splits correctly on
  LocalNet (split-sum test green); facilitator go/no-go decided.
- **S3 @ H8** — SplitRouter on **TestNet**, 5 recipients opted-in; `APP_ID/ADDRESS/ABI`
  handed to Dev A; MCP `install_audited_package` builds the group against the real app.
- **S4 @ H10** — Full E2E green: agent → 402 → autonomous pay → **5 inner transfers on
  Lora** → tarball installs. Remaining time = polish / EURD bonus / demo video.

---

## Dev A — Proxy / x402 / MCP / CLI

| Hr | Block | Driver |
|----|-------|--------|
| H0–1 | Hono skeleton; transparent passthrough to `registry.npmjs.org`. **→ S1** | `x402-proxy-engineer` |
| H1–3 | SQLite `audit_status` store; `/api/v1/status/:pkg/:version`; auto-reset; 402 branch vs mock app. Decide facilitator path. `/seed`. **→ S2** | `x402-proxy-engineer` |
| H3–6 | **MCP server (hero path):** `check_audit_status` + `install_audited_package` (402 → atomic group → sign → retry → tarball + attest txid), vs mock/LocalNet. | `mcp-payer-engineer` |
| H6–8 | Settlement wiring: confirmation gating + verify 5 inner txns before 200. Path B default; Path A behind flag. | `mcp-payer-engineer` |
| H8–10 | **Swap mock → real TestNet** APP_ID/ADDRESS/ABI from Dev B; full integration; `spm` CLI. **→ S4** | `mcp-payer-engineer` + pair w/ B |
| H10–12 | Harden error paths (timeout, underpay, already-installed); demo rehearsal; buffer. | — |

## Dev B — Contracts / chain

| Hr | Block | Driver |
|----|-------|--------|
| H0–1 | (after push) SplitRouter skeleton; LocalNet up; global state (5 addrs + ASSET_ID); `setRecipients`. SplitRouter compiles. **→ S1** | `algorand-contract-engineer` |
| H1–4 | `pay(payment, pkg, ver)`: asset/receiver/amount asserts + 5 inner axfers 500/200/150/100/50 + log. Tests: split-sum, reject wrong asset/amount/receiver. `/deploy` on LocalNet. **→ S2** | `algorand-contract-engineer` |
| H4–6 | `attest()` + box storage; `contracts/scripts/setup.ts` = deploy + setRecipients + **opt-in app & all 5 recipients** into USDC ASA. | `algorand-contract-engineer` |
| H6–8 | Deploy to **TestNet**; verify opt-ins; print + write APP_ID/APP_ADDRESS to `.env`; **hand ABI to Dev A**. `/deploy`. **→ S3** | `algorand-contract-engineer` |
| H8–10 | Pair on integration; write on-chain verify helper (read group → assert 5 inner amounts) for `integration-tester`; `/e2e`. **→ S4** | `integration-tester` |
| H10–12 | **EURD bonus** (only if S4 green + ≤30 min): opt recipients into EURD ASA, `setRecipients(…, eurdAssetId)`, add a 2nd priced route. Else: record backup demo video. | `algorand-contract-engineer` |

---

## Optional stronger demo (only if S4 is comfortably green)
Add a live audit beat: MCP `submit_audit({pkg,ver})` (or `spm audit`) that calls
`attest()` on-chain, flips the status to COMMUNITY_REVIEWED, and then the next install
is paid — shown live instead of pre-seeded.

## Descope ladder (if behind at H8/H10) — cut top-down
1. Drop **EURD bonus** (already conditional).
2. Drop **`spm` CLI** → MCP-only demo.
3. Drop **GoPlausible facilitator** → direct `algosdk` submit (already the safe default).
4. Drop **`attest()` box** → synthesize the `X-AUDIT-ATTESTATION` header from SQLite.
5. **Never cut the 5-way on-chain split** — that's the thesis.

## Demo runtime checklist (H11)
- [ ] Free install of an UNREVIEWED package — instant, no wallet.
- [ ] `install_audited_package("lodash","<ver>")` → 402 → autonomous pay → tarball.
- [ ] Lora open on the settlement txn showing 5 inner transfers 500/200/150/100/50.
- [ ] `curl /api/v1/status/lodash/<ver>` → status + attest txid.
- [ ] Version-bump line: status resets to UNREVIEWED → "that's the injection point."
- [ ] Backup video recorded and on disk.

---

# Detailed Implementation Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working npm registry overlay where AI agents autonomously pay USDC micropayments to install peer-reviewed packages, with an on-chain 5-way atomic split.

**Architecture:** Two parallel dev tracks syncing at hr8. Track B owns the SplitRouter AVM contract (Algorand TypeScript/Puya-TS) built on LocalNet then TestNet. Track A owns the Hono proxy, SQLite status store, x402 gate, MCP server, and CLI — stubbing APP_ID/APP_ADDRESS until the hr8 handoff.

**Tech Stack:** Algorand TypeScript (Puya-TS) + AlgoKit, Hono + @hono/node-server, better-sqlite3, @x402-avm/core+avm+hono+fetch, algosdk v3, @modelcontextprotocol/sdk, vitest.

> **Dependency security rules (enforced in CLAUDE.md):**
> - Use `pnpm` everywhere — never `npm install` or `yarn`.
> - All deps must be pinned exact (no `^` or `~`). `"latest"` in this plan means: run `pnpm add <pkg>` once to discover the version, then lock it in package.json.
> - After any `pnpm install`: run `pnpm audit --audit-level=moderate` and fix findings before committing.
> - Review `dependencies` + `peerDependencies` of every new package before adding it.
> - `pnpm config set ignore-scripts true` must be set per-machine before installing.

---

## File Map

```
contracts/
  smart_contracts/
    split_router/
      contract.algo.ts          NEW — SplitRouter ARC-4 contract
      deploy-config.ts          NEW — deploy + setRecipients + opt-ins
      contract.e2e.spec.ts      NEW — E2E tests against LocalNet
    index.ts                    EXISTING — auto-discovers deployers (no change needed)
    artifacts/                  GENERATED — SplitRouterClient.ts after build
  scripts/
    genaccounts.ts              NEW — generate 6 demo accounts → .env
  vitest.config.ts              NEW — vitest setup for contracts
  package.json                  MODIFY — add vitest + testing deps

proxy/
  package.json                  NEW
  tsconfig.json                 NEW
  src/
    db.ts                       NEW — SQLite init + queries
    status.ts                   NEW — getStatus / setStatus / auto-reset
    settle.ts                   NEW — decode PAYMENT-SIGNATURE + submit + verify
    proxy.ts                    NEW — forward tarball to registry.npmjs.org
    routes/status.ts            NEW — GET /api/v1/status/:pkg/:version
    app.ts                      NEW — Hono app wiring
    index.ts                    NEW — server entrypoint

mcp/
  package.json                  NEW
  tsconfig.json                 NEW
  src/
    signer.ts                   NEW — ClientAvmSigner from PAYER_MNEMONIC
    client.ts                   NEW — x402-avm/fetch wrapper
    tools/check.ts              NEW — check_audit_status MCP tool
    tools/install.ts            NEW — install_audited_package MCP tool
    index.ts                    NEW — MCP server entrypoint (stdio)

cli/
  package.json                  NEW
  src/
    index.ts                    NEW — spm install / status commands
```

---

## Track B — Contract (start immediately)

### Task B1: Add vitest, replace hello_world with SplitRouter stub

**Files:**
- Create: `contracts/vitest.config.ts`
- Modify: `contracts/package.json`
- Create: `contracts/smart_contracts/split_router/contract.algo.ts` (stub)
- Create: `contracts/smart_contracts/split_router/deploy-config.ts` (stub)
- Delete: `contracts/smart_contracts/hello_world/`

- [ ] **Step 1: Install test deps**

```bash
cd contracts
pnpm add --save-exact -D vitest @algorandfoundation/algorand-typescript-testing @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// contracts/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['smart_contracts/**/*.spec.ts'],
    testTimeout: 60000,
  },
})
```

- [ ] **Step 3: Add test script to contracts/package.json**

In `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Remove hello_world**

```bash
rm -rf contracts/smart_contracts/hello_world
```

- [ ] **Step 5: Create split_router contract stub**

```typescript
// contracts/smart_contracts/split_router/contract.algo.ts
import { Contract } from '@algorandfoundation/algorand-typescript'

export class SplitRouter extends Contract {
  hello(name: string): string {
    return `Hello, ${name}`
  }
}
```

- [ ] **Step 6: Create split_router deploy-config stub**

```typescript
// contracts/smart_contracts/split_router/deploy-config.ts
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { SplitRouterFactory } from '../artifacts/split_router/SplitRouterClient'

export async function deploy() {
  console.log('=== Deploying SplitRouter (stub) ===')
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  const factory = algorand.client.getTypedAppFactory(SplitRouterFactory, {
    defaultSender: deployer.addr,
  })
  const { appClient } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  console.log(`APP_ID=${appClient.appClient.appId}`)
  console.log(`APP_ADDRESS=${appClient.appAddress}`)
}
```

- [ ] **Step 7: Build to generate the typed client**

```bash
cd contracts
pnpm run build
```

Expected: `smart_contracts/artifacts/split_router/SplitRouterClient.ts` generated.

- [ ] **Step 8: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): scaffold split_router, replace hello_world"
```

---

### Task B2: Implement SplitRouter state + setRecipients

**Files:**
- Modify: `contracts/smart_contracts/split_router/contract.algo.ts`

- [ ] **Step 1: Replace stub with full state + setRecipients**

```typescript
// contracts/smart_contracts/split_router/contract.algo.ts
import {
  Contract, GlobalState, BoxMap,
  Txn, Global, Uint64, Account, Asset, bytes,
  assert, clone, log, op, gtxn, itxn,
} from '@algorandfoundation/algorand-typescript'

const UNIT = Uint64(1000) // 1000 µUSDC = $0.001

export class SplitRouter extends Contract {
  auditor     = GlobalState<bytes>({ key: 'aud' })
  maintainer  = GlobalState<bytes>({ key: 'mnt' })
  adversarial = GlobalState<bytes>({ key: 'adv' })
  treasury    = GlobalState<bytes>({ key: 'tre' })
  ops         = GlobalState<bytes>({ key: 'ops' })
  assetId     = GlobalState<uint64>({ key: 'ast' })

  attests = BoxMap<string, bytes>({ keyPrefix: 'attest:' })

  setRecipients(
    auditor: Account,
    maintainer: Account,
    adversarial: Account,
    treasury: Account,
    ops: Account,
    assetId: Asset,
  ): void {
    assert(Txn.sender.bytes === Global.creatorAddress.bytes, 'admin only')
    this.auditor.value     = auditor.bytes
    this.maintainer.value  = maintainer.bytes
    this.adversarial.value = adversarial.bytes
    this.treasury.value    = treasury.bytes
    this.ops.value         = ops.bytes
    this.assetId.value     = assetId.id
  }

  optInToAsset(asset: Asset): void {
    assert(Txn.sender.bytes === Global.creatorAddress.bytes, 'admin only')
    itxn.assetTransfer({
      xferAsset: asset,
      assetReceiver: Global.currentApplicationAddress,
      assetAmount: Uint64(0),
      fee: Uint64(0),
    }).submit()
  }
}
```

- [ ] **Step 2: Rebuild to regenerate typed client**

```bash
cd contracts && pnpm run build
```

Expected: no compile errors, updated `SplitRouterClient.ts`.

- [ ] **Step 3: Commit**

```bash
git add contracts/smart_contracts/split_router/contract.algo.ts
git commit -m "feat(contracts): add SplitRouter state + setRecipients + optInToAsset"
```

---

### Task B3: Implement pay() with 5 inner transfers + E2E test

**Files:**
- Modify: `contracts/smart_contracts/split_router/contract.algo.ts`
- Create: `contracts/smart_contracts/split_router/contract.e2e.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// contracts/smart_contracts/split_router/contract.e2e.spec.ts
import { Config } from '@algorandfoundation/algokit-utils'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import algosdk from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SplitRouterFactory } from '../artifacts/split_router/SplitRouterClient'

// TestNet USDC ASA ID — tests run on LocalNet and create a mock ASA
const USDC_DECIMALS = 6
const UNIT = 1000n // 1000 µUSDC

describe('SplitRouter', () => {
  const localnet = algorandFixture()

  beforeAll(() => { Config.configure({ debug: true }) })
  beforeEach(localnet.newScope)

  const deploy = async (creator: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(SplitRouterFactory, {
      defaultSender: creator,
    })
    const { appClient } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
    // Fund app account for box MBR + ASA opt-in MBR
    await localnet.algorand.send.payment({
      amount: (2).algo(),
      sender: creator,
      receiver: appClient.appAddress,
    })
    return appClient
  }

  const createMockUsdc = async (creator: Address) => {
    const result = await localnet.algorand.send.assetCreate({
      sender: creator,
      total: BigInt(1_000_000_000),
      decimals: USDC_DECIMALS,
      assetName: 'Mock USDC',
      unitName: 'USDC',
      defaultFrozen: false,
    })
    return result.confirmation.assetIndex!
  }

  test('split sum: 5 inner transfers sum to UNIT', async () => {
    const { testAccount, generateAccount } = localnet.context

    // Generate 5 recipient accounts
    const [auditor, maintainer, adversarial, treasury, ops] = await Promise.all(
      Array.from({ length: 5 }, () => generateAccount({ initialFunds: (1).algo() }))
    )

    const usdcId = await createMockUsdc(testAccount)
    const client = await deploy(testAccount)

    // Opt app into USDC
    await client.send.optInToAsset({
      args: { asset: usdcId },
      coverAppCallInnerTransactionFees: true,
    })

    // Opt all recipients into USDC
    for (const acct of [auditor, maintainer, adversarial, treasury, ops]) {
      await localnet.algorand.send.assetOptIn({ sender: acct, assetId: usdcId })
    }

    // Set recipients
    await client.send.setRecipients({
      args: {
        auditor: auditor.toString(),
        maintainer: maintainer.toString(),
        adversarial: adversarial.toString(),
        treasury: treasury.toString(),
        ops: ops.toString(),
        assetId: usdcId,
      },
    })

    // Fund payer with USDC
    await localnet.algorand.send.assetOptIn({ sender: testAccount, assetId: usdcId })
    await localnet.algorand.send.assetTransfer({
      sender: testAccount,
      receiver: testAccount,
      assetId: usdcId,
      amount: UNIT,
    })
    // Actually fund from the asset creator (testAccount created it with full supply)

    // Build the atomic group: [USDC axfer to app] + [appcall pay()]
    const paymentTxn = await localnet.algorand.createTransaction.assetTransfer({
      sender: testAccount,
      receiver: client.appAddress,
      assetId: usdcId,
      amount: UNIT,
    })

    const result = await client.newGroup()
      .pay({ args: { payment: paymentTxn, pkg: 'lodash', ver: '4.17.21' } })
      .send({ coverAppCallInnerTransactionFees: true })

    // Verify 5 inner transfers happened and sum to UNIT
    const confirmation = result.confirmations?.[1]
    const innerTxns = confirmation?.innerTxns ?? []
    expect(innerTxns).toHaveLength(5)

    const amounts = innerTxns.map((t: any) => BigInt(t.txn?.txn?.aamt ?? 0))
    const total = amounts.reduce((a: bigint, b: bigint) => a + b, 0n)
    expect(total).toBe(UNIT)
    expect(amounts).toEqual([500n, 200n, 150n, 100n, 50n])
  })

  test('pay() rejects wrong asset', async () => {
    const { testAccount, generateAccount } = localnet.context
    const [aud, mnt, adv, tre, ops] = await Promise.all(
      Array.from({ length: 5 }, () => generateAccount({ initialFunds: (1).algo() }))
    )
    const usdcId = await createMockUsdc(testAccount)
    const wrongId = await createMockUsdc(testAccount)
    const client = await deploy(testAccount)

    await client.send.optInToAsset({ args: { asset: usdcId }, coverAppCallInnerTransactionFees: true })
    for (const a of [aud, mnt, adv, tre, ops]) {
      await localnet.algorand.send.assetOptIn({ sender: a, assetId: usdcId })
    }
    await client.send.setRecipients({
      args: { auditor: aud.toString(), maintainer: mnt.toString(),
              adversarial: adv.toString(), treasury: tre.toString(),
              ops: ops.toString(), assetId: usdcId },
    })

    await localnet.algorand.send.assetOptIn({ sender: testAccount, assetId: wrongId })
    const badPayment = await localnet.algorand.createTransaction.assetTransfer({
      sender: testAccount,
      receiver: client.appAddress,
      assetId: wrongId,
      amount: UNIT,
    })

    await expect(
      client.newGroup().pay({ args: { payment: badPayment, pkg: 'lodash', ver: '4.17.21' } }).send()
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd contracts && pnpm test
```

Expected: FAIL — `pay` method does not exist on `SplitRouter`.

- [ ] **Step 3: Implement pay() in the contract**

Add to `contract.algo.ts`, inside the `SplitRouter` class (after `optInToAsset`):

```typescript
  pay(payment: gtxn.AssetTransferTxn, pkg: string, ver: string): void {
    assert(payment.xferAsset === Asset(clone(this.assetId.value)), 'wrong asset')
    assert(
      payment.assetReceiver.bytes === Global.currentApplicationAddress.bytes,
      'wrong receiver',
    )
    assert(payment.assetAmount === UNIT, 'wrong amount')

    const asset = Asset(clone(this.assetId.value))
    itxn.submitGroup(
      itxn.assetTransfer({ xferAsset: asset, assetReceiver: Account(clone(this.auditor.value)),     assetAmount: Uint64(500), fee: Uint64(0) }),
      itxn.assetTransfer({ xferAsset: asset, assetReceiver: Account(clone(this.maintainer.value)),  assetAmount: Uint64(200), fee: Uint64(0) }),
      itxn.assetTransfer({ xferAsset: asset, assetReceiver: Account(clone(this.adversarial.value)), assetAmount: Uint64(150), fee: Uint64(0) }),
      itxn.assetTransfer({ xferAsset: asset, assetReceiver: Account(clone(this.treasury.value)),    assetAmount: Uint64(100), fee: Uint64(0) }),
      itxn.assetTransfer({ xferAsset: asset, assetReceiver: Account(clone(this.ops.value)),         assetAmount: Uint64(50),  fee: Uint64(0) }),
    )
    log(pkg + '@' + ver + ' ' + Txn.sender.bytes)
  }
```

- [ ] **Step 4: Rebuild**

```bash
cd contracts && pnpm run build
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd contracts && pnpm test
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add contracts/smart_contracts/split_router/
git commit -m "feat(contracts): implement pay() with 5-way inner split + E2E tests"
```

---

### Task B4: Implement attest() + box storage

**Files:**
- Modify: `contracts/smart_contracts/split_router/contract.algo.ts`
- Modify: `contracts/smart_contracts/split_router/contract.e2e.spec.ts`

- [ ] **Step 1: Write failing test for attest()**

Add to the describe block in `contract.e2e.spec.ts`:

```typescript
  test('attest() writes box and only auditor can call it', async () => {
    const { testAccount, generateAccount } = localnet.context
    const [aud, mnt, adv, tre, opsAcct] = await Promise.all(
      Array.from({ length: 5 }, () => generateAccount({ initialFunds: (1).algo() }))
    )
    const usdcId = await createMockUsdc(testAccount)
    const client = await deploy(testAccount)

    await client.send.optInToAsset({ args: { asset: usdcId }, coverAppCallInnerTransactionFees: true })
    for (const a of [aud, mnt, adv, tre, opsAcct]) {
      await localnet.algorand.send.assetOptIn({ sender: a, assetId: usdcId })
    }
    await client.send.setRecipients({
      args: {
        auditor: aud.toString(), maintainer: mnt.toString(),
        adversarial: adv.toString(), treasury: tre.toString(),
        ops: opsAcct.toString(), assetId: usdcId,
      },
    })

    const boxKey = new TextEncoder().encode('attest:lodash@4.17.21')

    // Auditor can attest
    await client.send.attest({
      args: { pkg: 'lodash', ver: '4.17.21', status: 2n }, // 2 = COMMUNITY_REVIEWED
      sender: aud,
      boxReferences: [{ appId: client.appClient.appId, name: boxKey }],
    })

    // Box should exist
    const boxResult = await localnet.algorand.client.algod
      .getApplicationBoxByName(Number(client.appClient.appId), boxKey)
      .do()
    expect(boxResult.value).toBeDefined()
    expect(boxResult.value.length).toBe(80) // 32+32+8+8 bytes

    // Non-auditor cannot attest
    await expect(
      client.send.attest({
        args: { pkg: 'lodash', ver: '4.17.21', status: 2n },
        sender: testAccount,
        boxReferences: [{ appId: client.appClient.appId, name: boxKey }],
      })
    ).rejects.toThrow()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd contracts && pnpm test
```

Expected: FAIL — `attest` method does not exist.

- [ ] **Step 3: Implement attest() in the contract**

Add to `contract.algo.ts`, inside the `SplitRouter` class:

```typescript
  attest(pkg: string, ver: string, status: uint64): void {
    assert(Txn.sender.bytes === clone(this.auditor.value), 'not auditor')
    const key = pkg + '@' + ver
    // Pack 80 bytes: auditor(32) + txId(32) + status(8) + ts(8)
    const packed: bytes =
      Txn.sender.bytes +
      Txn.txID +
      op.itob(status) +
      op.itob(Global.latestTimestamp)
    this.attests(key).value = packed
  }
```

- [ ] **Step 4: Rebuild + run tests**

```bash
cd contracts && pnpm run build && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/smart_contracts/split_router/
git commit -m "feat(contracts): implement attest() with box storage"
```

---

### Task B5: genaccounts.ts — generate 6 demo wallets

**Files:**
- Create: `contracts/scripts/genaccounts.ts`

- [ ] **Step 1: Create the script**

```typescript
// contracts/scripts/genaccounts.ts
import algosdk from 'algosdk'
import fs from 'node:fs'
import path from 'node:path'

const accounts = {
  PAYER:        algosdk.generateAccount(),
  AUDITOR:      algosdk.generateAccount(),
  MAINTAINER:   algosdk.generateAccount(),
  ADVERSARIAL:  algosdk.generateAccount(),
  TREASURY:     algosdk.generateAccount(),
  OPS:          algosdk.generateAccount(),
}

const lines = Object.entries(accounts).flatMap(([name, acct]) => [
  `${name}_ADDR=${acct.addr}`,
  `${name}_MNEMONIC="${algosdk.secretKeyToMnemonic(acct.sk)}"`,
])

const envPath = path.resolve(process.cwd(), '.env')
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') + '\n' : ''
fs.writeFileSync(envPath, existing + lines.join('\n') + '\n')

console.log('Generated accounts (fund these on TestNet):')
for (const [name, acct] of Object.entries(accounts)) {
  console.log(`  ${name}: ${acct.addr}`)
}
console.log('\nFund ALGO via: https://testnet.algoexplorer.io/dispenser')
console.log('Fund USDC via: https://faucet.circle.com/')
console.log('\nAppended mnemonics to .env (keep secret!)')
```

- [ ] **Step 2: Run it**

```bash
cd contracts && npx ts-node --transpile-only scripts/genaccounts.ts
```

Expected: `.env` in contracts/ updated with 6 accounts; addresses printed.

- [ ] **Step 3: Add .env to .gitignore if not already**

```bash
grep -q '^\.env$' contracts/.gitignore || echo '.env' >> contracts/.gitignore
```

- [ ] **Step 4: Commit**

```bash
git add contracts/scripts/genaccounts.ts contracts/.gitignore
git commit -m "feat(contracts): add genaccounts.ts for demo wallet setup"
```

---

### Task B6: setup.ts — deploy + setRecipients + opt-ins

**Files:**
- Modify: `contracts/smart_contracts/split_router/deploy-config.ts`

This script runs via `pnpm run deploy` and handles the full TestNet setup. It reads account mnemonics from `.env` (set by genaccounts.ts + dotenv).

- [ ] **Step 1: Replace deploy-config stub with full setup**

```typescript
// contracts/smart_contracts/split_router/deploy-config.ts
import { AlgorandClient, microAlgos } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'
import { SplitRouterFactory } from '../artifacts/split_router/SplitRouterClient'

const USDC_TESTNET_ASA_ID = 10458941n

function loadAccount(mnemonic: string) {
  const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic)
  return { addr, sk }
}

export async function deploy() {
  console.log('=== Deploying SplitRouter ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // Load 5 recipient accounts from env
  const recipients = {
    auditor:     loadAccount(process.env.AUDITOR_MNEMONIC!),
    maintainer:  loadAccount(process.env.MAINTAINER_MNEMONIC!),
    adversarial: loadAccount(process.env.ADVERSARIAL_MNEMONIC!),
    treasury:    loadAccount(process.env.TREASURY_MNEMONIC!),
    ops:         loadAccount(process.env.OPS_MNEMONIC!),
  }

  const factory = algorand.client.getTypedAppFactory(SplitRouterFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })

  // Fund app account on first deploy (box MBR + ASA opt-in MBR)
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: microAlgos(2_000_000), // 2 Algo
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  // Set recipients
  await appClient.send.setRecipients({
    args: {
      auditor:     recipients.auditor.addr,
      maintainer:  recipients.maintainer.addr,
      adversarial: recipients.adversarial.addr,
      treasury:    recipients.treasury.addr,
      ops:         recipients.ops.addr,
      assetId:     USDC_TESTNET_ASA_ID,
    },
  })
  console.log('Recipients set.')

  // App account opts into USDC
  await appClient.send.optInToAsset({
    args: { asset: USDC_TESTNET_ASA_ID },
    coverAppCallInnerTransactionFees: true,
  })
  console.log('App account opted into USDC.')

  // Each recipient opts into USDC (funded by deployer for MBR)
  for (const [name, acct] of Object.entries(recipients)) {
    await algorand.send.assetOptIn({
      sender: acct.addr,
      assetId: USDC_TESTNET_ASA_ID,
      signer: algosdk.makeBasicAccountTransactionSigner({ addr: acct.addr, sk: acct.sk }),
    })
    console.log(`${name} opted into USDC.`)
  }

  console.log(`\nAPP_ID=${appClient.appClient.appId}`)
  console.log(`APP_ADDRESS=${appClient.appAddress}`)
  console.log('\nCopy these into the root .env file.')
}
```

- [ ] **Step 2: Start LocalNet and test the deploy**

```bash
algokit localnet start
cd contracts && pnpm run deploy
```

Expected: `APP_ID=...` and `APP_ADDRESS=...` printed; no errors.

- [ ] **Step 3: Stop LocalNet**

```bash
algokit localnet stop
```

- [ ] **Step 4: Commit**

```bash
git add contracts/smart_contracts/split_router/deploy-config.ts
git commit -m "feat(contracts): full deploy-config with setRecipients + opt-ins"
```

---

### Task B7: TestNet deploy + handoff

Prerequisite: `.env` has funded TestNet wallets (see SETUP.md step 4).

- [ ] **Step 1: Create contracts/.env.testnet** (or use the existing `.env`)

```bash
# contracts/.env  — add/verify these lines
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_TOKEN=
DEPLOYER_MNEMONIC="<payer mnemonic from genaccounts>"
AUDITOR_MNEMONIC="<auditor mnemonic>"
MAINTAINER_MNEMONIC="<maintainer mnemonic>"
ADVERSARIAL_MNEMONIC="<adversarial mnemonic>"
TREASURY_MNEMONIC="<treasury mnemonic>"
OPS_MNEMONIC="<ops mnemonic>"
```

- [ ] **Step 2: Deploy to TestNet**

```bash
cd contracts && ppnpm run deploy:ci
```

Expected: `APP_ID=<number>` and `APP_ADDRESS=<58-char address>` printed.

- [ ] **Step 3: Write APP_ID and APP_ADDRESS to root .env**

```bash
# Add to the project root .env:
SPLIT_APP_ID=<number from above>
SPLIT_APP_ADDRESS=<address from above>
```

- [ ] **Step 4: Verify on Lora**

Open `https://testnet.lora.algokit.io/application/<APP_ID>` — confirm global state shows 5 recipients + asset ID 10458941.

- [ ] **Step 5: Run /handoff command**

In Claude Code: `/handoff SplitRouter deployed on TestNet — APP_ID and APP_ADDRESS in root .env. ABI at contracts/smart_contracts/artifacts/split_router/SplitRouter.arc56.json`

- [ ] **Step 6: Commit**

```bash
git add .env.example  # add a .env.example with placeholders, never commit real .env
git commit -m "feat(contracts): TestNet deploy complete — APP_ID/APP_ADDRESS documented"
```

---

## Track A — Proxy + MCP + CLI

### Task A1: Scaffold proxy/ + SQLite status store

**Files:**
- Create: `proxy/package.json`
- Create: `proxy/tsconfig.json`
- Create: `proxy/src/db.ts`
- Create: `proxy/src/status.ts`

- [ ] **Step 1: Create proxy/package.json**

```json
{
  "name": "spm-proxy",
  "version": "1.0.0",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --import tsx/esm src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "1.13.7",
    "@x402-avm/avm": "latest",
    "@x402-avm/core": "latest",
    "@x402-avm/hono": "latest",
    "algosdk": "3.2.0",
    "better-sqlite3": "11.6.0",
    "hono": "4.6.17"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.11",
    "@types/node": "22.10.2",
    "tsx": "4.19.2",
    "typescript": "5.7.3",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
cd proxy && pnpm install
```

- [ ] **Step 3: Create proxy/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create proxy/src/db.ts**

```typescript
// proxy/src/db.ts
import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'

const DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'audit.db')

const db = new BetterSqlite3(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_status (
    pkg       TEXT NOT NULL,
    version   TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'UNREVIEWED',
    auditor_addr TEXT,
    attest_txid  TEXT,
    ts        INTEGER,
    PRIMARY KEY (pkg, version)
  )
`)

export type StatusRow = {
  pkg: string
  version: string
  status: string
  auditor_addr: string | null
  attest_txid: string | null
  ts: number | null
}

export const getStatus = db.prepare<[string, string], StatusRow>(
  'SELECT * FROM audit_status WHERE pkg = ? AND version = ?'
)

export const upsertStatus = db.prepare<[string, string, string, string | null, string | null, number | null]>(
  `INSERT INTO audit_status (pkg, version, status, auditor_addr, attest_txid, ts)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(pkg, version) DO UPDATE SET
     status = excluded.status,
     auditor_addr = excluded.auditor_addr,
     attest_txid = excluded.attest_txid,
     ts = excluded.ts`
)

export default db
```

- [ ] **Step 5: Create proxy/src/status.ts**

```typescript
// proxy/src/status.ts
import { getStatus, upsertStatus, type StatusRow } from './db.js'

export const PAID_STATUSES = new Set(['COMMUNITY_REVIEWED', 'PEER_REVIEWED'])

export function isFree(status: string): boolean {
  return !PAID_STATUSES.has(status)
}

export function getStatusOrUnreviewed(pkg: string, version: string): StatusRow {
  return (
    getStatus.get(pkg, version) ?? {
      pkg,
      version,
      status: 'UNREVIEWED',
      auditor_addr: null,
      attest_txid: null,
      ts: null,
    }
  )
}

export function setStatus(
  pkg: string,
  version: string,
  status: string,
  auditorAddr: string | null = null,
  attestTxid: string | null = null,
): void {
  upsertStatus.run(pkg, version, status, auditorAddr, attestTxid, Date.now())
}
```

- [ ] **Step 6: Write unit tests for status store**

Create `proxy/src/status.test.ts`:

```typescript
// proxy/src/status.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import db from './db.js'
import { getStatusOrUnreviewed, setStatus, isFree } from './status.js'

beforeEach(() => {
  db.exec('DELETE FROM audit_status')
})

describe('status store', () => {
  test('returns UNREVIEWED for unknown pkg+version', () => {
    const row = getStatusOrUnreviewed('lodash', '4.17.21')
    expect(row.status).toBe('UNREVIEWED')
  })

  test('isFree returns true for UNREVIEWED', () => {
    expect(isFree('UNREVIEWED')).toBe(true)
  })

  test('isFree returns false for COMMUNITY_REVIEWED', () => {
    expect(isFree('COMMUNITY_REVIEWED')).toBe(false)
  })

  test('setStatus persists and getStatus reads it back', () => {
    setStatus('lodash', '4.17.21', 'COMMUNITY_REVIEWED', '0xAUD', 'txid123')
    const row = getStatusOrUnreviewed('lodash', '4.17.21')
    expect(row.status).toBe('COMMUNITY_REVIEWED')
    expect(row.auditor_addr).toBe('0xAUD')
  })

  test('auto-reset: different version defaults to UNREVIEWED', () => {
    setStatus('lodash', '4.17.21', 'COMMUNITY_REVIEWED', null, null)
    const row = getStatusOrUnreviewed('lodash', '4.17.22')
    expect(row.status).toBe('UNREVIEWED')
  })
})
```

- [ ] **Step 7: Run tests**

```bash
cd proxy && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add proxy/
git commit -m "feat(proxy): scaffold + SQLite status store with auto-reset"
```

---

### Task A2: Hono app + npm passthrough + /api/v1/status endpoint

**Files:**
- Create: `proxy/src/proxy.ts`
- Create: `proxy/src/routes/status.ts`
- Create: `proxy/src/app.ts`
- Create: `proxy/src/index.ts`

- [ ] **Step 1: Create proxy/src/proxy.ts**

```typescript
// proxy/src/proxy.ts
import { Context } from 'hono'

const NPM_REGISTRY = 'https://registry.npmjs.org'

export async function proxyToNpm(c: Context): Promise<Response> {
  const upstream = `${NPM_REGISTRY}${c.req.path}${c.req.query() ? '?' + new URLSearchParams(c.req.query() as Record<string, string>).toString() : ''}`
  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')

  const response = await fetch(upstream, {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  })
}
```

- [ ] **Step 2: Create proxy/src/routes/status.ts**

```typescript
// proxy/src/routes/status.ts
import { Hono } from 'hono'
import { getStatusOrUnreviewed } from '../status.js'

const router = new Hono()

router.get('/:pkg/:version', (c) => {
  const { pkg, version } = c.req.param()
  const row = getStatusOrUnreviewed(decodeURIComponent(pkg), version)
  return c.json(row)
})

// Scoped packages: @scope/pkg
router.get('/:scope/:pkg/:version', (c) => {
  const { scope, pkg, version } = c.req.param()
  const fullPkg = `${decodeURIComponent(scope)}/${decodeURIComponent(pkg)}`
  const row = getStatusOrUnreviewed(fullPkg, version)
  return c.json(row)
})

export default router
```

- [ ] **Step 3: Create proxy/src/app.ts (stub — x402 gate added in A3)**

```typescript
// proxy/src/app.ts
import { Hono } from 'hono'
import statusRouter from './routes/status.js'
import { proxyToNpm } from './proxy.js'

const app = new Hono()

app.route('/api/v1/status', statusRouter)

// Fallback: proxy everything to npm
app.all('*', (c) => proxyToNpm(c))

export default app
```

- [ ] **Step 4: Create proxy/src/index.ts**

```typescript
// proxy/src/index.ts
import { serve } from '@hono/node-server'
import app from './app.js'

const PORT = Number(process.env.PORT ?? 4873)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`SPM proxy listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 5: Start and verify npm passthrough**

```bash
cd proxy && pnpm dev &
curl -s http://localhost:4873/lodash | jq '.name'
# Expected: "lodash"
curl -s http://localhost:4873/api/v1/status/lodash/4.17.21 | jq '.status'
# Expected: "UNREVIEWED"
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add proxy/src/
git commit -m "feat(proxy): Hono app + npm passthrough + status API"
```

---

### Task A3: x402 gate — 402 response for paid tarballs

**Files:**
- Modify: `proxy/src/app.ts`

The gate logic: detect tarball requests, look up status, return 402 with PaymentRequirements if paid tier.

- [ ] **Step 1: Write failing integration test**

Create `proxy/src/app.test.ts`:

```typescript
// proxy/src/app.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import app from './app.js'
import db from './db.js'
import { setStatus } from './status.js'

beforeEach(() => {
  db.exec('DELETE FROM audit_status')
  // Set a fake APP_ADDRESS for tests
  process.env.SPLIT_APP_ADDRESS = 'FAKEADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  process.env.SPLIT_APP_ID = '999'
})

describe('x402 gate', () => {
  test('free package: tarball proxied without 402', async () => {
    // UNREVIEWED = free, should not return 402
    const res = await app.request('/lodash/-/lodash-4.17.21.tgz')
    expect(res.status).not.toBe(402)
  })

  test('paid package: tarball returns 402 without payment', async () => {
    setStatus('lodash', '4.17.21', 'COMMUNITY_REVIEWED', null, null)
    const res = await app.request('/lodash/-/lodash-4.17.21.tgz')
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.accepts[0].scheme).toBe('exact')
    expect(body.accepts[0].asset).toBe('10458941')
    expect(body.accepts[0].maxAmountRequired).toBe('1000')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd proxy && pnpm test
```

Expected: FAIL — no 402 returned.

- [ ] **Step 3: Add x402 gate to app.ts**

```typescript
// proxy/src/app.ts
import { Hono } from 'hono'
import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from '@x402-avm/avm'
import statusRouter from './routes/status.js'
import { proxyToNpm } from './proxy.js'
import { getStatusOrUnreviewed, isFree } from './status.js'

const app = new Hono()

app.route('/api/v1/status', statusRouter)

function isTarball(path: string): boolean {
  return path.includes('/-/') && path.endsWith('.tgz')
}

function parseTarballPkg(path: string): { pkg: string; version: string } {
  // e.g. /lodash/-/lodash-4.17.21.tgz or /@scope/pkg/-/pkg-1.0.0.tgz
  const parts = path.replace(/^\//, '').split('/-/')
  const pkg = parts[0] ?? ''
  const filename = parts[1] ?? ''
  const match = filename.match(/^.+-(\d+\.\d+\.\d+.*)\.tgz$/)
  const version = match?.[1] ?? 'unknown'
  return { pkg, version }
}

app.all('*', async (c, next) => {
  if (!isTarball(c.req.path)) return next()

  const { pkg, version } = parseTarballPkg(c.req.path)
  const row = getStatusOrUnreviewed(pkg, version)

  if (isFree(row.status)) return next()

  // Paid tier — check for payment header
  const paymentHeader = c.req.header('PAYMENT-SIGNATURE')
  if (!paymentHeader) {
    return c.json(
      {
        x402Version: 2,
        accepts: [
          {
            scheme: 'exact',
            network: ALGORAND_TESTNET_CAIP2,
            payTo: process.env.SPLIT_APP_ADDRESS!,
            asset: String(USDC_TESTNET_ASA_ID),
            maxAmountRequired: '1000',
            maxTimeoutSeconds: 60,
            extra: {
              name: 'USDC',
              decimals: 6,
              appMethod: 'pay',
              args: [pkg, version],
            },
          },
        ],
      },
      402,
    )
  }

  // Has payment — settle in next task; for now pass through
  return next()
})

app.all('*', (c) => proxyToNpm(c))

export default app
```

- [ ] **Step 4: Run tests**

```bash
cd proxy && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add proxy/src/app.ts proxy/src/app.test.ts
git commit -m "feat(proxy): x402 gate — 402 response for paid tarballs"
```

---

### Task A4: Settlement — decode PAYMENT-SIGNATURE + submit + verify

**Files:**
- Create: `proxy/src/settle.ts`
- Modify: `proxy/src/app.ts`

- [ ] **Step 1: Create proxy/src/settle.ts**

```typescript
// proxy/src/settle.ts
import algosdk from 'algosdk'

export type Settlement = { success: true; txid: string } | { success: false; error: string }

const algod = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN ?? '',
  process.env.ALGOD_SERVER ?? 'https://testnet-api.algonode.cloud',
  '',
)

export async function settle(paymentHeader: string): Promise<Settlement> {
  try {
    // Decode the PAYMENT-SIGNATURE header: base64(JSON)
    const decoded: { payload: { signedTransactions: string[] } } = JSON.parse(
      Buffer.from(paymentHeader, 'base64').toString('utf8'),
    )

    const rawTxns = decoded.payload.signedTransactions.map(
      (t: string) => Buffer.from(t, 'base64') as unknown as Uint8Array,
    )

    const { txid } = await algod.sendRawTransaction(rawTxns).do()
    await algosdk.waitForConfirmation(algod, txid, 6)

    // Verify: check the confirmed txn has 5 inner asset transfers
    const info = await algod.pendingTransactionInformation(txid).do()
    const innerTxns: unknown[] = (info as any).innerTxns ?? []
    if (innerTxns.length < 5) {
      return { success: false, error: 'expected 5 inner transfers, got ' + innerTxns.length }
    }

    return { success: true, txid }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

- [ ] **Step 2: Wire settle() into app.ts**

Replace the `// Has payment — settle in next task; for now pass through` comment block in `app.ts` with:

```typescript
  // Has payment — settle and proxy
  const { settle } = await import('./settle.js')
  const result = await settle(paymentHeader)
  if (!result.success) {
    return c.json({ error: result.error }, 402)
  }
  // Fall through to proxy handler below; attach attestation header
  c.set('settlementTxid', result.txid)
  return next()
```

And update the catch-all proxy handler to attach the attestation header:

```typescript
app.all('*', async (c) => {
  const response = await proxyToNpm(c)
  const txid = c.get('settlementTxid') as string | undefined
  if (txid) {
    const headers = new Headers(response.headers)
    headers.set('X-AUDIT-ATTESTATION', txid)
    return new Response(response.body, { status: response.status, headers })
  }
  return response
})
```

- [ ] **Step 3: Commit**

```bash
git add proxy/src/settle.ts proxy/src/app.ts
git commit -m "feat(proxy): settlement path B — decode PAYMENT-SIGNATURE + direct algod submit"
```

---

### Task A5: Seed SQLite for demo

- [ ] **Step 1: Run the /seed command in Claude Code**

```
/seed lodash@4.17.21
```

Expected output: 2 rows — `lodash@4.17.21` as `COMMUNITY_REVIEWED`, one UNREVIEWED package.

- [ ] **Step 2: Verify**

```bash
cd proxy
curl -s http://localhost:4873/api/v1/status/lodash/4.17.21 | jq '.status'
# Expected: "COMMUNITY_REVIEWED"
```

- [ ] **Step 3: Commit**

```bash
git add proxy/seed.sql  # or however /seed writes the data
git commit -m "chore(proxy): seed demo audit_status entries"
```

---

### Task A6: Scaffold mcp/ + check_audit_status tool

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/index.ts`
- Create: `mcp/src/tools/check.ts`

- [ ] **Step 1: Create mcp/package.json**

```json
{
  "name": "spm-mcp",
  "version": "1.0.0",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": { "spm-mcp": "src/index.ts" },
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "node --import tsx/esm src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.12.0",
    "@x402-avm/avm": "latest",
    "@x402-avm/fetch": "latest",
    "algosdk": "3.2.0"
  },
  "devDependencies": {
    "@types/node": "22.10.2",
    "tsx": "4.19.2",
    "typescript": "5.7.3"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
cd mcp && pnpm install
```

- [ ] **Step 3: Create mcp/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create mcp/src/tools/check.ts**

```typescript
// mcp/src/tools/check.ts
const PROXY_URL = process.env.SPM_PROXY_URL ?? 'http://localhost:4873'

export const checkTool = {
  name: 'check_audit_status',
  description: 'Check the audit status of an npm package version. Free — no payment required.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pkg:     { type: 'string', description: 'Package name, e.g. "lodash" or "@scope/pkg"' },
      version: { type: 'string', description: 'Exact version string, e.g. "4.17.21"' },
    },
    required: ['pkg', 'version'],
  },
  async handler({ pkg, version }: { pkg: string; version: string }) {
    const encodedPkg = encodeURIComponent(pkg)
    const url = `${PROXY_URL}/api/v1/status/${encodedPkg}/${version}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
    return res.json()
  },
}
```

- [ ] **Step 5: Create mcp/src/index.ts**

```typescript
// mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { checkTool } from './tools/check.js'
import { installTool } from './tools/install.js'

const server = new McpServer({ name: 'spm', version: '0.1.0' })

server.tool(
  checkTool.name,
  checkTool.description,
  { pkg: z.string(), version: z.string() },
  async ({ pkg, version }) => ({
    content: [{ type: 'text', text: JSON.stringify(await checkTool.handler({ pkg, version }), null, 2) }],
  }),
)

server.tool(
  installTool.name,
  installTool.description,
  { pkg: z.string(), version: z.string() },
  async ({ pkg, version }) => ({
    content: [{ type: 'text', text: JSON.stringify(await installTool.handler({ pkg, version }), null, 2) }],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 6: Create install stub so index.ts compiles**

```typescript
// mcp/src/tools/install.ts (stub — implemented in next task)
export const installTool = {
  name: 'install_audited_package',
  description: 'Install a package via SPM, paying micropayment if audited.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pkg:     { type: 'string' },
      version: { type: 'string' },
    },
    required: ['pkg', 'version'],
  },
  async handler({ pkg, version }: { pkg: string; version: string }) {
    return { status: 'not_implemented', pkg, version }
  },
}
```

- [ ] **Step 7: Verify MCP server starts**

```bash
cd mcp && echo '{"method":"initialize","params":{},"id":1,"jsonrpc":"2.0"}' | pnpm dev 2>/dev/null | head -5
```

Expected: JSON response with server info.

- [ ] **Step 8: Commit**

```bash
git add mcp/
git commit -m "feat(mcp): scaffold + check_audit_status tool"
```

---

### Task A7: install_audited_package — 402 → pay → retry

**Files:**
- Create: `mcp/src/signer.ts`
- Modify: `mcp/src/tools/install.ts`

- [ ] **Step 1: Create mcp/src/signer.ts**

```typescript
// mcp/src/signer.ts
import algosdk from 'algosdk'
import type { ClientAvmSigner } from '@x402-avm/avm'

export function signerFromMnemonic(mnemonic: string): ClientAvmSigner {
  const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic)
  return {
    address: addr.toString(),
    signTransactions: async (txns: Uint8Array[], indexesToSign?: number[]) =>
      txns.map((txn, i) => {
        if (indexesToSign && !indexesToSign.includes(i)) return null
        const decoded = algosdk.decodeUnsignedTransaction(txn)
        return algosdk.signTransaction(decoded, sk).blob
      }),
  }
}
```

- [ ] **Step 2: Implement install.ts**

```typescript
// mcp/src/tools/install.ts
import { x402Client } from '@x402-avm/fetch'
import { registerExactAvmScheme } from '@x402-avm/avm/exact/client'
import { wrapFetchWithPayment } from '@x402-avm/fetch'
import { signerFromMnemonic } from '../signer.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROXY_URL = process.env.SPM_PROXY_URL ?? 'http://localhost:4873'

function buildPaidFetch() {
  const mnemonic = process.env.PAYER_MNEMONIC
  if (!mnemonic) throw new Error('PAYER_MNEMONIC not set')
  const signer = signerFromMnemonic(mnemonic)
  const client = new x402Client()
  registerExactAvmScheme(client, { signer })
  return wrapFetchWithPayment(fetch, client)
}

export const installTool = {
  name: 'install_audited_package',
  description:
    'Install an npm package via SPM. If the package is COMMUNITY_REVIEWED or higher, automatically pays the $0.001 USDC micropayment on Algorand and returns the tarball path + settlement txid.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pkg:     { type: 'string', description: 'Package name, e.g. "lodash"' },
      version: { type: 'string', description: 'Exact version string, e.g. "4.17.21"' },
    },
    required: ['pkg', 'version'],
  },
  async handler({ pkg, version }: { pkg: string; version: string }) {
    const encodedPkg = pkg.startsWith('@') ? pkg.replace('/', '%2F') : pkg
    const url = `${PROXY_URL}/${encodedPkg}/-/${pkg.split('/').pop()}-${version}.tgz`

    const fetchWithPay = buildPaidFetch()
    const res = await fetchWithPay(url)

    if (!res.ok) {
      throw new Error(`Install failed: ${res.status} ${await res.text()}`)
    }

    // Save tarball to tmp dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-'))
    const tarballPath = path.join(tmpDir, `${pkg.replace('/', '-')}-${version}.tgz`)
    const buffer = await res.arrayBuffer()
    fs.writeFileSync(tarballPath, Buffer.from(buffer))

    const attestation = res.headers.get('X-AUDIT-ATTESTATION') ?? null
    const paymentResponse = res.headers.get('PAYMENT-RESPONSE') ?? null

    return {
      pkg,
      version,
      tarballPath,
      attestation,
      paymentResponse,
      loraUrl: attestation
        ? `https://testnet.lora.algokit.io/transaction/${attestation}`
        : null,
    }
  },
}
```

- [ ] **Step 3: Verify end-to-end (proxy must be running)**

```bash
# Terminal 1
cd proxy && pnpm dev

# Terminal 2 — call the MCP tool manually
SPM_PROXY_URL=http://localhost:4873 \
PAYER_MNEMONIC="<payer mnemonic from .env>" \
cd mcp && node --import tsx/esm -e "
import { installTool } from './src/tools/install.js'
installTool.handler({ pkg: 'lodash', version: '4.17.21' }).then(console.log).catch(console.error)
"
```

Expected (for COMMUNITY_REVIEWED lodash): `{ tarballPath: '...', attestation: '...', loraUrl: '...' }`

- [ ] **Step 4: Commit**

```bash
git add mcp/src/
git commit -m "feat(mcp): install_audited_package — auto 402→pay→retry with @x402-avm/fetch"
```

---

### Task A8: spm CLI wrapper

**Files:**
- Create: `cli/package.json`
- Create: `cli/src/index.ts`

- [ ] **Step 1: Create cli/package.json**

```json
{
  "name": "spm",
  "version": "0.1.0",
  "type": "module",
  "bin": { "spm": "src/index.ts" },
  "scripts": { "start": "tsx src/index.ts" },
  "dependencies": {
    "@x402-avm/avm": "latest",
    "@x402-avm/fetch": "latest",
    "algosdk": "3.2.0"
  },
  "devDependencies": { "tsx": "4.19.2", "typescript": "5.7.3", "@types/node": "22.10.2" }
}
```

```bash
cd cli && pnpm install
```

- [ ] **Step 2: Create cli/src/index.ts**

```typescript
// cli/src/index.ts
import { installTool } from '../../mcp/src/tools/install.js'
import { checkTool } from '../../mcp/src/tools/check.js'

const [,, command, pkg, version] = process.argv

async function main() {
  if (!command || !pkg) {
    console.log('Usage: spm install <pkg> <version>')
    console.log('       spm status <pkg> <version>')
    process.exit(1)
  }

  if (command === 'install') {
    if (!version) { console.error('version required'); process.exit(1) }
    const result = await installTool.handler({ pkg, version })
    console.log(JSON.stringify(result, null, 2))
    if (result.loraUrl) console.log('\nLora:', result.loraUrl)
  } else if (command === 'status') {
    if (!version) { console.error('version required'); process.exit(1) }
    const result = await checkTool.handler({ pkg, version })
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Verify CLI works**

```bash
cd cli && SPM_PROXY_URL=http://localhost:4873 tsx src/index.ts status lodash 4.17.21
# Expected: {"pkg":"lodash","version":"4.17.21","status":"COMMUNITY_REVIEWED",...}
```

- [ ] **Step 4: Commit**

```bash
git add cli/
git commit -m "feat(cli): spm install/status wrapper"
```

---

### Task A9: Wire APP_ID/APP_ADDRESS (post hr8 sync)

After Dev B hands off `SPLIT_APP_ID` and `SPLIT_APP_ADDRESS`:

- [ ] **Step 1: Update root .env**

```
SPLIT_APP_ID=<real app id from TestNet>
SPLIT_APP_ADDRESS=<real app address>
```

- [ ] **Step 2: Verify the proxy PaymentRequirements use the real APP_ADDRESS**

```bash
cd proxy && pnpm dev &
curl -s -o /dev/null -w "%{http_code}" http://localhost:4873/lodash/-/lodash-4.17.21.tgz
# Expected: 402

curl -s http://localhost:4873/lodash/-/lodash-4.17.21.tgz | jq '.accepts[0].payTo'
# Expected: the real TestNet app address
kill %1
```

- [ ] **Step 3: Run full E2E via /e2e command**

```
/e2e
```

Expected: integration-tester returns go/no-go with Lora URL for settlement txn.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: wire real TestNet APP_ID/APP_ADDRESS from hr8 handoff"
```

---

## Sync Points

| Time | Action |
|------|--------|
| hr1  | Dev A: proxy passthrough proven. Dev B: genaccounts run, wallets funded. |
| hr3  | Dev A: x402 gate returning 402. Dev B: LocalNet contract tested. |
| hr8  | **Critical sync**: Dev B hands APP_ID + APP_ADDRESS to Dev A. Dev A wires into proxy. |
| hr10 | Run `/e2e` — full agent→pay→split→install E2E on TestNet. Record video. |
| hr12 | Demo ready. Run `/seed` if needed to refresh DB. |
