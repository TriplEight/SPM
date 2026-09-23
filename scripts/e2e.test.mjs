// scripts/e2e.test.mjs
//
// Unit tests for scripts/e2e.mjs's pure gating logic only — the 250-package
// on-chain rehearsal itself needs a running proxy, a deployed PaymentRouter,
// and funded TestNet accounts, and is exercised by scripts/verify.sh (which
// SKIPs it when those are absent) and by a real operator run, never here.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onChainRehearsalSkipReason } from './e2e.mjs'

const ALL_VARS_SET = {
  PAYMENT_ROUTER_APP_ID: '1',
  PAY_TO_ADDRESS: 'ADDR',
  CREDITER_MNEMONIC: 'word '.repeat(25).trim(),
  SPM_DONOR_MNEMONIC: 'word '.repeat(25).trim(),
  E2E_AUDITOR_CLAIM_MNEMONIC: 'word '.repeat(25).trim(),
  E2E_OPS_CLAIM_MNEMONIC: 'word '.repeat(25).trim(),
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
  assert.match(reason, /PAYMENT_ROUTER_APP_ID/)
  assert.match(reason, /PAY_TO_ADDRESS/)
  assert.match(reason, /CREDITER_MNEMONIC/)
  assert.match(reason, /SPM_DONOR_MNEMONIC/)
  assert.match(reason, /E2E_AUDITOR_CLAIM_MNEMONIC/)
  assert.match(reason, /E2E_OPS_CLAIM_MNEMONIC/)
})

test('TestNet with one missing var SKIPs naming only that variable', () => {
  const env = { ...ALL_VARS_SET }
  delete env.E2E_OPS_CLAIM_MNEMONIC
  const reason = onChainRehearsalSkipReason('testnet', env)
  assert.equal(reason, 'missing env var(s): E2E_OPS_CLAIM_MNEMONIC')
})
