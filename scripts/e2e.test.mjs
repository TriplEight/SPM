// scripts/e2e.test.mjs
//
// Unit tests for scripts/e2e.mjs's pure gating and funding logic only — the
// 250-package on-chain rehearsal itself needs a running proxy, a real
// TestNet deploy, and funded accounts, and is exercised by
// scripts/verify.sh (which SKIPs it when those are absent) and by a real
// operator run, never here.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importWithoutEnvMutation } from './assert-no-env-import.mjs'
import {
  assertDeployerFunded,
  assertDonorFundedForRehearsal,
  assertRehearsalKeysDistinct,
  claimantFundingMicroAlgo,
  deployerFundingTotalMicroAlgo,
  onChainRehearsalSkipReason,
  payToFundingMicroAlgo,
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
  assert.throws(() => assertDeployerFunded(1_000, 2_000), /deployer holds 1000 microALGO/)
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
  assert.throws(() => assertDonorFundedForRehearsal(249_999), /donor holds 249999 microUSDC/)
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
