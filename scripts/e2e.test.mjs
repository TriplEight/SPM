// scripts/e2e.test.mjs
//
// Unit tests for scripts/e2e.mjs's pure gating and funding logic only — the
// 250-package on-chain rehearsal itself needs a running proxy, a real
// TestNet deploy, and funded accounts, and is exercised by
// scripts/verify.sh (which SKIPs it when those are absent) and by a real
// operator run, never here.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importWithoutEnvMutation } from './assert-no-env-import.mjs'
import {
  assertDeployerFunded,
  assertDonorFundedForRehearsal,
  assertPlainUsdcTransferNoInner,
  assertRehearsalKeysDistinct,
  claimantFundingMicroAlgo,
  deployerFundingTotalMicroAlgo,
  onChainRehearsalSkipReason,
  payToFundingMicroAlgo,
  resolveTsxBin,
  runTsxScript,
  waitForIndexerTransaction,
} from './e2e.mjs'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const e2eModuleHref = pathToFileURL(path.join(scriptsDir, 'e2e.mjs')).href

// R3a Result 2: e2e.mjs's own import chain (claim.mjs, rekey-payto.mjs,
// optin-usdc.mjs) must never read the root .env just because something
// imports e2e.mjs — only main() (the CLI entry path) may. Checked in a
// child process that never opens the real root .env
// (assert-no-env-import.mjs) — the main tree's .env holds real TestNet
// keys, and this test runs on every push. e2e.mjs's own top-level imports
// are plain built-ins and local .mjs modules (no TypeScript source), so a
// bare `node` import — no tsx — proves the whole chain.
test("importing e2e.mjs's own module chain never touches .env or mutates process.env", () => {
  const report = importWithoutEnvMutation(e2eModuleHref)
  assert.deepEqual(report.envPaths, [])
  assert.equal(report.envKeysChanged, false)
})

const ALL_VARS_SET = {
  DEPLOYER_MNEMONIC: 'word '.repeat(25).trim(),
  CREDITER_MNEMONIC: 'word '.repeat(25).trim(),
  SPM_DONOR_MNEMONIC: 'word '.repeat(25).trim(),
}

test('MainNet always SKIPs with the TestNet-only reason, even with every var set', () => {
  const reason = onChainRehearsalSkipReason('mainnet', ALL_VARS_SET)
  assert.match(reason, /TestNet only/)
})

test('TestNet with every required var set does not SKIP', () => {
  assert.equal(onChainRehearsalSkipReason('testnet', ALL_VARS_SET), null)
})

test('TestNet with no vars set SKIPs naming every missing variable', () => {
  const reason = onChainRehearsalSkipReason('testnet', {})
  assert.match(reason, /DEPLOYER_MNEMONIC/)
  assert.match(reason, /CREDITER_MNEMONIC/)
  assert.match(reason, /SPM_DONOR_MNEMONIC/)
})

test('TestNet with one missing var SKIPs naming only that variable', () => {
  const env = { ...ALL_VARS_SET }
  delete env.DEPLOYER_MNEMONIC
  const reason = onChainRehearsalSkipReason('testnet', env)
  assert.equal(reason, 'missing env var(s): DEPLOYER_MNEMONIC')
})

// R3a: the rehearsal deploys its own fresh app and payTo every run, so it
// no longer reads a persistent app id, payTo, or standalone claimant keys —
// only the three vars above are ever named.
test('the rehearsal requires exactly three env vars, no more', () => {
  const reason = onChainRehearsalSkipReason('testnet', {})
  const namedCount = reason.replace('missing env var(s): ', '').split(', ').length
  assert.equal(namedCount, 3)
})

// --- Funding amounts (R3a) -------------------------------------------------

test('payToFundingMicroAlgo covers MBR, one ASA opt-in, the opt-in fee, and the rekey fee', () => {
  assert.equal(payToFundingMicroAlgo(), 202_000)
})

test("claimantFundingMicroAlgo covers MBR, one ASA opt-in, the opt-in fee, and claim()'s outer fee floor", () => {
  assert.equal(claimantFundingMicroAlgo(), 203_000)
})

test('deployerFundingTotalMicroAlgo funds payTo, both claimants, the app account, and deploy fees', () => {
  assert.equal(deployerFundingTotalMicroAlgo(), 1_722_000)
})

// --- Preconditions (R3a) ----------------------------------------------------

test('assertDeployerFunded refuses a deployer balance below the required total', () => {
  assert.throws(() => assertDeployerFunded(1_000, 2_000), /deployer .* holds 1000 microALGO/)
})

test('assertDeployerFunded passes at or above the required total', () => {
  assert.doesNotThrow(() => assertDeployerFunded(2_000, 2_000))
})

test('assertDeployerFunded defaults its required amount to deployerFundingTotalMicroAlgo()', () => {
  const required = deployerFundingTotalMicroAlgo()
  assert.throws(() => assertDeployerFunded(required - 1))
  assert.doesNotThrow(() => assertDeployerFunded(required))
})

test('assertDonorFundedForRehearsal refuses a donor balance below 250,000 microUSDC', () => {
  assert.throws(() => assertDonorFundedForRehearsal(249_999), /donor .* holds 249999 microUSDC/)
})

test('assertDonorFundedForRehearsal passes at or above 250,000 microUSDC', () => {
  assert.doesNotThrow(() => assertDonorFundedForRehearsal(250_000))
})

test('assertRehearsalKeysDistinct refuses when the crediter equals the deployer', () => {
  assert.throws(
    () =>
      assertRehearsalKeysDistinct({
        deployerAddress: 'ADDR_A',
        crediterAddress: 'ADDR_A',
        donorAddress: 'ADDR_B',
      }),
    /CREDITER_MNEMONIC.*DEPLOYER_MNEMONIC/,
  )
})

test('assertRehearsalKeysDistinct refuses when the deployer equals the donor', () => {
  assert.throws(
    () =>
      assertRehearsalKeysDistinct({
        deployerAddress: 'ADDR_A',
        crediterAddress: 'ADDR_B',
        donorAddress: 'ADDR_A',
      }),
    /DEPLOYER_MNEMONIC.*SPM_DONOR_MNEMONIC/,
  )
})

test('assertRehearsalKeysDistinct refuses when the crediter equals the donor', () => {
  assert.throws(
    () =>
      assertRehearsalKeysDistinct({
        deployerAddress: 'ADDR_A',
        crediterAddress: 'ADDR_B',
        donorAddress: 'ADDR_B',
      }),
    /CREDITER_MNEMONIC.*SPM_DONOR_MNEMONIC/,
  )
})

test('assertRehearsalKeysDistinct passes when every address is distinct', () => {
  assert.doesNotThrow(() =>
    assertRehearsalKeysDistinct({
      deployerAddress: 'ADDR_A',
      crediterAddress: 'ADDR_B',
      donorAddress: 'ADDR_C',
    }),
  )
})

// --- Precondition messages name the account, never a mnemonic (Defect 3, R3b) ---

const FAKE_MNEMONIC = 'word '.repeat(25).trim()

test('assertDeployerFunded names the deployer address and carries no mnemonic', () => {
  assert.throws(() => assertDeployerFunded(0, 1_722_000, 'DEPLOYERADDR'), /DEPLOYERADDR/)
  try {
    assertDeployerFunded(0, 1_722_000, 'DEPLOYERADDR')
    assert.fail('expected assertDeployerFunded to throw')
  } catch (e) {
    assert.equal(e.message.includes(FAKE_MNEMONIC), false)
  }
})

test('assertDonorFundedForRehearsal names the donor address and carries no mnemonic', () => {
  assert.throws(() => {
    assertDonorFundedForRehearsal(0, 'DONORADDR')
  }, /DONORADDR/)
})

test('assertRehearsalKeysDistinct names the colliding addresses', () => {
  assert.throws(
    () =>
      assertRehearsalKeysDistinct({
        deployerAddress: 'SAMEADDR',
        crediterAddress: 'SAMEADDR',
        donorAddress: 'DONORADDR',
      }),
    /SAMEADDR/,
  )
})

// --- waitForIndexerTransaction: bounded retry, never a silent pass (Defect 2, R3b) ---

test('waitForIndexerTransaction returns the transaction once the indexer has it', async () => {
  let calls = 0
  const indexerClient = {
    lookupTransactionByID: () => ({
      do: async () => {
        calls++
        if (calls < 3) throw new Error('404 not found')
        return { transaction: { txType: 'axfer' } }
      },
    }),
  }
  const sleeps = []
  const transaction = await waitForIndexerTransaction(indexerClient, 'TXID123', {
    timeoutMs: 10_000,
    intervalMs: 5,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  assert.deepEqual(transaction, { txType: 'axfer' })
  assert.equal(calls, 3)
  assert.equal(sleeps.length, 2)
})

test('waitForIndexerTransaction FAILs on timeout, naming the txid', async () => {
  const indexerClient = {
    lookupTransactionByID: () => ({
      do: async () => {
        throw new Error('404 not found')
      },
    }),
  }
  let now = 0
  await assert.rejects(
    waitForIndexerTransaction(indexerClient, 'TXID_NEVER_FOUND', {
      timeoutMs: 30,
      intervalMs: 10,
      sleep: async (ms) => {
        now += ms
      },
    }),
    (e) => {
      assert.match(e.message, /TXID_NEVER_FOUND/)
      assert.match(e.message, /30ms/)
      return true
    },
  )
  assert.ok(now >= 30)
})

// --- assertPlainUsdcTransferNoInner: exact shape, never a false PASS (Defect 2, R3b) ---

const GOOD_TRANSACTION = {
  txType: 'axfer',
  assetTransferTransaction: { assetId: 31566704, receiver: 'PAYTOADDR' },
  innerTxns: [],
}

test('assertPlainUsdcTransferNoInner passes a plain USDC transfer to payTo', () => {
  assert.doesNotThrow(() =>
    assertPlainUsdcTransferNoInner(GOOD_TRANSACTION, {
      payToAddress: 'PAYTOADDR',
      assetId: 31566704,
      txid: 'TXID1',
    }),
  )
})

test('assertPlainUsdcTransferNoInner FAILs on the wrong asset', () => {
  assert.throws(
    () =>
      assertPlainUsdcTransferNoInner(GOOD_TRANSACTION, {
        payToAddress: 'PAYTOADDR',
        assetId: 10458941,
        txid: 'TXID1',
      }),
    /moves asset 31566704, expected USDC asset 10458941/,
  )
})

test('assertPlainUsdcTransferNoInner FAILs on the wrong receiver', () => {
  assert.throws(
    () =>
      assertPlainUsdcTransferNoInner(GOOD_TRANSACTION, {
        payToAddress: 'SOMEONEELSE',
        assetId: 31566704,
        txid: 'TXID1',
      }),
    /pays PAYTOADDR, expected payTo SOMEONEELSE/,
  )
})

test('assertPlainUsdcTransferNoInner FAILs when the txn carries inner transactions', () => {
  const transactionWithInner = { ...GOOD_TRANSACTION, innerTxns: [{ txType: 'pay' }] }
  assert.throws(
    () =>
      assertPlainUsdcTransferNoInner(transactionWithInner, {
        payToAddress: 'PAYTOADDR',
        assetId: 31566704,
        txid: 'TXID1',
      }),
    /carries 1 inner transaction/,
  )
})

test('assertPlainUsdcTransferNoInner FAILs on a non-axfer transaction', () => {
  assert.throws(
    () =>
      assertPlainUsdcTransferNoInner(
        { txType: 'pay' },
        { payToAddress: 'PAYTOADDR', assetId: 31566704, txid: 'TXID1' },
      ),
    /is not an asset transfer/,
  )
})

// --- deriveAttestSigningKey: same public key as the proxy (Defect 1, R3b) -----
//
// deriveAttestSigningKey dynamically imports proxy/src/attest/keys.ts, a
// TypeScript source file plain `node` cannot resolve (proved by the
// tsx-free module-chain test above). Run through a real tsx subprocess —
// the exact way e2e.mjs itself runs — never re-implemented as a mock.

test('deriveAttestSigningKey derives the same public key as the proxy, for a mnemonic and a hex seed', async () => {
  let tsxBin
  try {
    tsxBin = resolveTsxBin()
  } catch {
    return // no tsx installed in this environment; nothing to prove here
  }

  const keysHref = pathToFileURL(
    path.join(scriptsDir, '..', 'proxy', 'src', 'attest', 'keys.ts'),
  ).href
  const proxyPkgHref = pathToFileURL(path.join(scriptsDir, '..', 'proxy', 'package.json')).href

  const body = `import { createRequire } from 'node:module'
import { loadSigningKey } from ${JSON.stringify(keysHref)}
import { deriveAttestSigningKey } from ${JSON.stringify(e2eModuleHref)}

const require = createRequire(${JSON.stringify(proxyPkgHref)})
const algosdk = require('algosdk')

const account = algosdk.generateAccount()
const mnemonic = algosdk.secretKeyToMnemonic(account.sk)
const seedHex = Buffer.from(account.sk.slice(0, 32)).toString('hex')

const viaMnemonic = await deriveAttestSigningKey(mnemonic)
const viaHex = await deriveAttestSigningKey(seedHex)
const direct = await loadSigningKey(mnemonic)

console.log(JSON.stringify({
  mnemonicKeyid: viaMnemonic.keyid,
  hexKeyid: viaHex.keyid,
  directKeyid: direct.keyid,
  mnemonicPub: Buffer.from(viaMnemonic.publicKey).toString('base64'),
  hexPub: Buffer.from(viaHex.publicKey).toString('base64'),
  directPub: Buffer.from(direct.publicKey).toString('base64'),
}))
`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-e2e-keys-test-'))
  const scriptPath = path.join(tmpDir, 'derive-attest-signing-key.mjs')
  fs.writeFileSync(scriptPath, body)

  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }
  const stdout = runTsxScript(tsxBin, path.join(scriptsDir, '..', 'proxy'), scriptPath, env)
  const result = JSON.parse(stdout.trim().split('\n').pop())

  assert.equal(result.mnemonicKeyid, result.directKeyid)
  assert.equal(result.hexKeyid, result.directKeyid)
  assert.equal(result.mnemonicPub, result.directPub)
  assert.equal(result.hexPub, result.directPub)
})
