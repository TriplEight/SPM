#!/usr/bin/env node

// SPM end-to-end check — drives the real flow against a running proxy.
// Usage: node scripts/e2e.mjs (tsx required — several checks import .ts
// source files directly; see the imports below).
//
// Reads NETWORK, SPM_PROXY_URL, SQLITE_PATH, and ATTEST_SIGNING_KEY from the
// environment — the same variables the proxy process reads (proxy/src/config.ts).
// Set them once, in the same shell, before starting both the proxy and this
// script (scripts/verify.sh and scripts/demo.sh both do this).
//
// Exit 0 = every check that ran passed. Exit 1 = at least one check failed.
// A SKIPPED check never causes a non-zero exit — only a FAILED one does.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertBalanceAtLeastMinClaim,
  assertSignerIsMappedAddress,
  MIN_CLAIM,
  readIdentityBalance,
  readMappedAddress,
  submitClaim,
} from './claim.mjs'
import { assertSqliteWriteAllowed } from './e2e-guard.mjs'
import { algodEndpoint, indexerEndpoint, usdcAssetId } from './network.mjs'

// Anchors a CJS `require()` at each workspace package's own node_modules —
// scripts/ has no node_modules of its own. Mirrors the pattern already
// established for algosdk imports in this file.
const requireFromProxy = createRequire(new URL('../proxy/package.json', import.meta.url))
const algosdk = requireFromProxy('algosdk')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

const PROXY_URL = process.env.SPM_PROXY_URL ?? 'http://localhost:4873'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-e2e-'))

let passed = 0
let failed = 0
let skipped = 0

async function check(name, fn) {
  process.stdout.write(`  ${name}: `)
  try {
    const result = await fn()
    console.log(`PASS${result ? ` (${result})` : ''}`)
    passed++
    return true
  } catch (e) {
    console.log(`FAIL - ${e.message}`)
    failed++
    return false
  }
}

// WARNING: a SKIP must always carry a reason. A silent skip is as dishonest
// as a false PASS — the reader must know exactly what did not run and why.
function skip(name, reason) {
  console.log(`  ${name}: SKIP - ${reason}`)
  skipped++
}

// ── On-chain: PaymentRouter 250-package credit/claim rehearsal (R3) ────────
//
// One reviewed package's auditor share is 400 microUSDC — far below
// MIN_CLAIM (100,000, contract.algo.ts). This rehearsal pays for
// ONCHAIN_ENTRY_COUNT reviewed packages in one lockfile attestation so both
// the auditor and ops claims clear MIN_CLAIM in a single run. Every fixture
// row shares one repo and one reviewer identity: credit()'s entries[] is
// one row per (repo, identity), and buildCreditCallRefs (proxy/src/claims/
// credit.ts) caps a credit() call at 8 foreign references — a shared
// (repo, identity) collapses 250 packages into exactly one auditor entry.
//
// TestNet only (SPEC §17: never manufacture MainNet volume) — gated by
// onChainRehearsalSkipReason, unit-tested in scripts/e2e.test.mjs.

const ONCHAIN_ENTRY_COUNT = 250
const ONCHAIN_REPO = 'npm:spm-e2e-rehearsal'
const ONCHAIN_REVIEWER_LOGIN = 'spm-e2e-auditor'
const ONCHAIN_IDENTITY = `github:${ONCHAIN_REVIEWER_LOGIN}`
const ONCHAIN_OPS_IDENTITY = 'ops'
// SPEC §13.2 auditor share: 400 per 1,000 microUSDC paid.
const ONCHAIN_AUDITOR_SHARE_MICRO = (ONCHAIN_ENTRY_COUNT * 1_000 * 400) / 1_000

const ONCHAIN_REQUIRED_ENV_VARS = [
  'PAYMENT_ROUTER_APP_ID',
  'PAY_TO_ADDRESS',
  'CREDITER_MNEMONIC',
  'SPM_DONOR_MNEMONIC',
  'E2E_AUDITOR_CLAIM_MNEMONIC',
  'E2E_OPS_CLAIM_MNEMONIC',
]

/**
 * Why the 250-package on-chain rehearsal does not run, or null when it
 * should. Pure: no network access, no filesystem access — every check.mjs
 * that calls this passes NETWORK and the process environment explicitly,
 * so scripts/e2e.test.mjs covers both branches (MainNet, and each missing
 * variable by name) without touching a real chain.
 *
 * @param {'testnet'|'mainnet'} network
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
export function onChainRehearsalSkipReason(network, env) {
  if (network !== 'testnet') {
    return '250-package claim rehearsal is TestNet only (SPEC §17: never manufacture volume)'
  }
  const missing = ONCHAIN_REQUIRED_ENV_VARS.filter((name) => !env[name])
  if (missing.length > 0) {
    return `missing env var(s): ${missing.join(', ')}`
  }
  return null
}

/**
 * Loads the first `ONCHAIN_ENTRY_COUNT` entries of the committed fixture:
 * real npm `express` name@version pairs and their real, published sha512
 * integrity (scripts/fixtures/e2e-lockfile-packages.json — public npm
 * facts, not a review record; see the fixture file's own banner). Every
 * entry resolves as reviewed, never UNRESOLVABLE or INTEGRITY_MISMATCH,
 * because both the lockfile body and the seeded audit_status row below
 * carry the exact same real digest.
 */
function loadOnChainFixtureEntries() {
  const fixturePath = path.join(scriptDir, 'fixtures', 'e2e-lockfile-packages.json')
  const entries = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  if (entries.length < ONCHAIN_ENTRY_COUNT) {
    throw new Error(
      `fixtures/e2e-lockfile-packages.json has only ${entries.length} entries, ` +
        `need at least ${ONCHAIN_ENTRY_COUNT}`,
    )
  }
  return entries.slice(0, ONCHAIN_ENTRY_COUNT)
}

/**
 * Builds a lockfileVersion 3 body listing every fixture entry once, each
 * under its own synthetic nested path (`node_modules/depN/node_modules/
 * express`) — a real lockfile shape for a monorepo that pins many versions
 * of the same dependency across its workspaces. `packageNameFromKey`
 * (proxy/src/attest/lockfile.ts) reads the name from the path's last
 * segment, so the nesting never affects classification; `version` on each
 * entry is what actually varies.
 */
function buildOnChainLockfileBytes(entries) {
  const packages = {}
  entries.forEach((entry, index) => {
    packages[`node_modules/dep${index}/node_modules/${entry.name}`] = {
      version: entry.version,
      resolved: `https://registry.npmjs.org/${entry.name}/-/${entry.name}-${entry.version}.tgz`,
      integrity: entry.integrity,
    }
  })
  return Buffer.from(JSON.stringify({ lockfileVersion: 3, packages }))
}

/** `identity`'s USDC holding on `address`; 0 when not opted in or empty. */
async function usdcHolding(algod, address, assetId) {
  const info = await algod.accountInformation(address).do()
  const holding = (info.assets ?? []).find((a) => Number(a.assetId) === Number(assetId))
  return holding ? Number(holding.amount) : 0
}

/**
 * Claims `identity`'s whole PaymentRouter balance with `account`, and
 * asserts the claimant's own USDC balance grew by exactly the claimed
 * amount — reuses scripts/claim.mjs's own guards and submission logic
 * (never a second, hand-rolled claim path).
 */
async function claimOnChain(algod, appId, identity, account, payToAddress, assetId, loraUrl) {
  const mapped = await readMappedAddress(algod, appId, identity)
  assertSignerIsMappedAddress(mapped, account.addr.toString())
  const balance = await readIdentityBalance(algod, appId, identity)
  assertBalanceAtLeastMinClaim(balance)

  const usdcBefore = await usdcHolding(algod, account.addr.toString(), assetId)
  const txid = await submitClaim(algod, appId, identity, account, payToAddress, assetId)
  await algosdk.waitForConfirmation(algod, txid, 6)
  const usdcAfter = await usdcHolding(algod, account.addr.toString(), assetId)
  const grew = usdcAfter - usdcBefore
  if (grew !== balance) {
    throw new Error(`claimant USDC balance grew by ${grew}, expected exactly ${balance}`)
  }
  console.log(`\n    Claim (${identity}): ${txid}`)
  console.log(`    Lora: ${loraUrl(txid)}`)
}

/**
 * Runs the 250-package on-chain rehearsal: seeds the fixture rows, pays
 * for the lockfile via the real MCP attest_lockfile tool, runs the nightly
 * job against the already-open throwaway SQLite database, then claims both
 * identities. Every sub-step is its own `check()`, so a failure here is a
 * FAIL with the exact assertion that broke — never a silent skip and never
 * a false PASS. Preconditions run first and, on failure, stop the whole
 * rehearsal (no further check ever claims a PASS it did not earn).
 */
async function runOnChainRehearsal(loraUrl) {
  const { setStatus } = await import('../proxy/src/status.js')
  const dbModule = await import('../proxy/src/db.js')
  const db = dbModule.default
  const { PRICE_PER_REVIEWED_PACKAGE_MICRO } = await import('../proxy/src/routes/attest.js')
  const { runNightly } = await import('../proxy/src/claims/nightly.js')
  const { backupDatabase } = await import('../proxy/src/claims/backup.js')
  const { buildAlgodCreditClient } = await import('../proxy/src/claims/credit.js')
  const { createIndexerClient } = await import('../proxy/src/claims/indexer.js')
  const { attestLockfileTool } = await import('../mcp/src/tools/attest.js')

  const priceMicro = ONCHAIN_ENTRY_COUNT * PRICE_PER_REVIEWED_PACKAGE_MICRO
  const usdcAsaId = BigInt(usdcAssetId('testnet'))
  const { server, port, token } = algodEndpoint('testnet')
  const algod = new algosdk.Algodv2(token, server, port)
  const appId = BigInt(process.env.PAYMENT_ROUTER_APP_ID)
  const payToAddress = process.env.PAY_TO_ADDRESS
  const auditorAccount = algosdk.mnemonicToSecretKey(process.env.E2E_AUDITOR_CLAIM_MNEMONIC)
  const opsAccount = algosdk.mnemonicToSecretKey(process.env.E2E_OPS_CLAIM_MNEMONIC)

  const preconditionsOk = await check('on-chain: 250-pkg rehearsal preconditions', async () => {
    const appAddress = algosdk.getApplicationAddress(appId).toString()
    const payToInfo = await algod.accountInformation(payToAddress).do()
    if (payToInfo.authAddr?.toString() !== appAddress) {
      throw new Error(
        `payTo (${payToAddress}) is not rekeyed to PaymentRouter app ${appId} — ` +
          'run scripts/rekey-payto.mjs first',
      )
    }

    const auditorMapped = await readMappedAddress(algod, appId, ONCHAIN_IDENTITY)
    if (auditorMapped !== auditorAccount.addr.toString()) {
      throw new Error(
        `identity "${ONCHAIN_IDENTITY}" is not mapped to E2E_AUDITOR_CLAIM_MNEMONIC's address ` +
          `(${auditorAccount.addr}); an admin must call setIdentity("${ONCHAIN_IDENTITY}", ...) first`,
      )
    }
    const opsMapped = await readMappedAddress(algod, appId, ONCHAIN_OPS_IDENTITY)
    if (opsMapped !== opsAccount.addr.toString()) {
      throw new Error(
        'identity "ops" is not mapped to E2E_OPS_CLAIM_MNEMONIC\'s address ' +
          `(${opsAccount.addr}); an admin must call setIdentity("ops", ...) first`,
      )
    }

    const donorAddress = algosdk.mnemonicToSecretKey(process.env.SPM_DONOR_MNEMONIC).addr.toString()
    const donorBalance = await usdcHolding(algod, donorAddress, usdcAsaId)
    if (donorBalance < priceMicro) {
      throw new Error(
        `donor (${donorAddress}) holds ${donorBalance} microUSDC, needs at least ` +
          `${priceMicro} to pay for the ${ONCHAIN_ENTRY_COUNT}-package lockfile`,
      )
    }
  })
  if (!preconditionsOk) return

  const fixtureEntries = loadOnChainFixtureEntries()
  // WARNING: the same guard e2e.mjs's own single fixture row uses above —
  // this must never write to a real database (CLAUDE.md invariant 5).
  assertSqliteWriteAllowed(process.env.SQLITE_PATH)
  for (const entry of fixtureEntries) {
    /* guard-allow: RULE9 — e2e.mjs's own throwaway-SQLITE_PATH fixture write, gated by assertSqliteWriteAllowed() above */ setStatus(
      entry.name,
      entry.version,
      'COMMUNITY_REVIEWED',
      'E2E_ONCHAIN_AUDITOR',
      'E2E_ONCHAIN_TXID',
      entry.integrity,
      ONCHAIN_REVIEWER_LOGIN,
      null,
      ONCHAIN_REPO,
    )
  }

  const lockfilePath = path.join(tmpDir, 'onchain-package-lock.json')
  fs.writeFileSync(lockfilePath, buildOnChainLockfileBytes(fixtureEntries))

  let paymentTxid
  const paymentOk = await check(
    `on-chain: ${ONCHAIN_ENTRY_COUNT}-pkg lockfile payment (${priceMicro} microUSDC)`,
    async () => {
      const result = await attestLockfileTool.handler({ lockfilePath, allowDonation: true })
      if (result.status !== 'attested') {
        throw new Error(`expected attested, got ${result.status}`)
      }
      if (result.summary?.reviewed !== ONCHAIN_ENTRY_COUNT) {
        throw new Error(`expected ${ONCHAIN_ENTRY_COUNT} reviewed, got ${result.summary?.reviewed}`)
      }
      const settled = db
        .prepare('SELECT DISTINCT settle_txid FROM accruals WHERE repo = ?')
        .all(ONCHAIN_REPO)
      if (settled.length !== 1) {
        throw new Error(
          `expected exactly one settlement txid for repo ${ONCHAIN_REPO}, got ${settled.length}`,
        )
      }
      paymentTxid = settled[0].settle_txid
      console.log(`\n    Settlement: ${paymentTxid}`)
      console.log(`    Lora: ${loraUrl(paymentTxid)}`)
    },
  )
  if (!paymentOk) return

  let auditorBeforeClaim
  let opsBeforeClaim
  const creditOk = await check('on-chain: nightly credit (250-pkg batch)', async () => {
    const auditorBefore = await readIdentityBalance(algod, appId, ONCHAIN_IDENTITY)
    const opsBefore = await readIdentityBalance(algod, appId, ONCHAIN_OPS_IDENTITY)

    const { server: indexerUrl } = indexerEndpoint('testnet')
    const indexer = createIndexerClient(indexerUrl, String(usdcAsaId))
    const creditClient = buildAlgodCreditClient(
      algod,
      indexer,
      process.env.CREDITER_MNEMONIC,
      payToAddress,
      usdcAsaId,
    )
    const backupDir = path.join(tmpDir, 'nightly-backup')

    const logLines = []
    await runNightly({
      indexer,
      backup: () => backupDatabase(db, backupDir),
      creditClient,
      env: process.env,
      log: (line) => {
        logLines.push(line)
        console.log(`    ${line}`)
      },
    })

    const creditLine = logLines.find((line) => line.includes('spm-nightly: credited batch'))
    if (!creditLine) {
      throw new Error(`nightly job did not credit a batch: ${logLines.join(' | ')}`)
    }
    const match = /credited batch (\d+), txid (\S+)/.exec(creditLine)
    if (!match) throw new Error(`could not parse batch/txid from: ${creditLine}`)
    const batchSeq = Number(match[1])
    const creditTxid = match[2]
    console.log(`    Lora: ${loraUrl(creditTxid)}`)

    const batchRow = db
      .prepare(
        'SELECT attributed_micro, unattributed_micro, credit_txid FROM batches WHERE batch_seq = ?',
      )
      .get(batchSeq)
    if (!batchRow?.credit_txid) {
      throw new Error(`batch ${batchSeq} has no recorded credit_txid`)
    }

    const ourAuditorShare =
      db
        .prepare(
          "SELECT SUM(amount_micro) as total FROM accruals WHERE role = 'auditor' AND identity = ? AND repo = ?",
        )
        .get(ONCHAIN_IDENTITY.toLowerCase(), ONCHAIN_REPO)?.total ?? 0
    if (ourAuditorShare !== ONCHAIN_AUDITOR_SHARE_MICRO) {
      throw new Error(
        `fixture ledger rows sum to ${ourAuditorShare} microUSDC for the auditor role, ` +
          `expected ${ONCHAIN_AUDITOR_SHARE_MICRO}`,
      )
    }

    // ops's on-chain share is 60% of this batch's whole attributed total,
    // plus any unattributed total (contract.algo.ts's credit(): opsAmount =
    // attributedTotal - entriesTotal + unattributedTotal, and entries[]
    // always sums to exactly 40% of attributedTotal regardless of how many
    // distinct auditor identities it is split across). Computed from the
    // batch this run actually created, not hardcoded to our own 250-package
    // contribution alone: the same batch may also carry an earlier check's
    // settled payment (§8 above, when SPM_DONOR_MNEMONIC is set) or a
    // reconciled historical inflow on this persistent TestNet payTo.
    const expectedOpsDelta =
      Math.trunc((batchRow.attributed_micro * 600) / 1000) + batchRow.unattributed_micro

    const auditorAfter = await readIdentityBalance(algod, appId, ONCHAIN_IDENTITY)
    const opsAfter = await readIdentityBalance(algod, appId, ONCHAIN_OPS_IDENTITY)
    const auditorDelta = auditorAfter - auditorBefore
    const opsDelta = opsAfter - opsBefore
    if (auditorDelta !== ONCHAIN_AUDITOR_SHARE_MICRO) {
      throw new Error(
        `auditor balance grew by ${auditorDelta}, expected ${ONCHAIN_AUDITOR_SHARE_MICRO}`,
      )
    }
    if (opsDelta !== expectedOpsDelta) {
      throw new Error(`ops balance grew by ${opsDelta}, expected ${expectedOpsDelta}`)
    }
    auditorBeforeClaim = auditorAfter
    opsBeforeClaim = opsAfter
  })
  if (!creditOk) return

  console.log(
    `  (auditor balance before claim: ${auditorBeforeClaim} microUSDC — at least MIN_CLAIM ${MIN_CLAIM})`,
  )
  console.log(
    `  (ops balance before claim: ${opsBeforeClaim} microUSDC — at least MIN_CLAIM ${MIN_CLAIM})`,
  )

  await check(`on-chain: claim (${ONCHAIN_IDENTITY})`, () =>
    claimOnChain(algod, appId, ONCHAIN_IDENTITY, auditorAccount, payToAddress, usdcAsaId, loraUrl),
  )
  await check('on-chain: claim (ops)', () =>
    claimOnChain(algod, appId, ONCHAIN_OPS_IDENTITY, opsAccount, payToAddress, usdcAsaId, loraUrl),
  )
}

async function main() {
  // config.js resolves NETWORK/CAIP2/USDC-asset/payTo from the same
  // environment the proxy process reads — imported directly, never
  // re-derived, so this script can never drift from what the proxy is
  // actually enforcing.
  const { NETWORK, CAIP2_NETWORK, USDC_ASA_ID, PAY_TO, FACILITATOR_URL, resolveFeePayer } =
    await import('../proxy/src/config.js')
  const { setStatus } = await import('../proxy/src/status.js')
  const { decodePaymentRequiredHeader } = requireFromProxy('@x402-avm/core/http')
  const { HTTPFacilitatorClient } = requireFromProxy('@x402-avm/core/server')

  const netSegment = NETWORK === 'testnet' ? 'testnet' : 'mainnet'
  const loraUrl = (txid) => `https://lora.algokit.io/${netSegment}/transaction/${txid}`

  console.log(`== SPM E2E (network=${NETWORK}, proxy=${PROXY_URL}) ==`)

  // ── 1. Free path: install an UNREVIEWED package — zero payment, no wallet ──
  await check('free install (UNREVIEWED): 200, no payment, no wallet', async () => {
    const res = await fetch(`${PROXY_URL}/chalk/-/chalk-5.3.0.tgz`)
    if (res.status === 402) throw new Error('unreviewed tarball must never return 402')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (res.headers.get('PAYMENT-REQUIRED')) {
      throw new Error('unreviewed tarball must carry no PAYMENT-REQUIRED header')
    }
  })

  // An unreviewed tarball never returns 402, even with the donate header —
  // the free tier is sacred (CLAUDE.md invariant 4).
  await check('unreviewed tarball, X-SPM-Donate: 1: still 200, never 402', async () => {
    const res = await fetch(`${PROXY_URL}/chalk/-/chalk-5.3.0.tgz`, {
      headers: { 'X-SPM-Donate': '1' },
    })
    if (res.status === 402) throw new Error('unreviewed tarball must never return 402')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })

  // ── 2. Paid gate: seed a COMMUNITY_REVIEWED tarball ───────────────────────
  const PAID_PKG = 'express'
  const PAID_VER = '4.21.2'
  // The call below writes through the real status store (better-sqlite3,
  // the same SQLITE_PATH the proxy process has open) — no external
  // `sqlite3` binary dependency, and no hand-written SQL to drift from the
  // schema.
  //
  // Refuses first unless SQLITE_PATH resolves inside a throwaway directory
  // (os.tmpdir()): this script runs manually, on any machine, and a real
  // deployment's database (the Docker Compose path is /data/audit.db) must
  // never receive a fake review row (CLAUDE.md invariant 5). NETWORK alone
  // does not cover this — the first deploy is TestNet, not MainNet.
  assertSqliteWriteAllowed(process.env.SQLITE_PATH)
  setStatus(PAID_PKG, PAID_VER, 'COMMUNITY_REVIEWED', 'E2E_AUDITOR', 'E2E_TXID') // guard-allow: RULE9 — e2e.mjs's own throwaway-SQLITE_PATH fixture write, gated by assertSqliteWriteAllowed() above

  // A reviewed tarball is free by default (ADR 0006) — it returns 402 only
  // when the request opts in with X-SPM-Donate: 1.
  await check(`reviewed tarball, no donate header: ${PAID_PKG}@${PAID_VER} -> 200`, async () => {
    const res = await fetch(`${PROXY_URL}/${PAID_PKG}/-/${PAID_PKG}-${PAID_VER}.tgz`)
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
    if (!res.headers.get('X-SPM-Tier')) throw new Error('missing X-SPM-Tier response header')
    if (res.headers.get('X-SPM-Donate-Hint') !== '1000') {
      throw new Error(`bad X-SPM-Donate-Hint: ${res.headers.get('X-SPM-Donate-Hint')}`)
    }
  })

  await check(`paid gate: ${PAID_PKG}@${PAID_VER} tarball, X-SPM-Donate: 1 -> 402`, async () => {
    const res = await fetch(`${PROXY_URL}/${PAID_PKG}/-/${PAID_PKG}-${PAID_VER}.tgz`, {
      headers: { 'X-SPM-Donate': '1' },
    })
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`)

    // The 402 JSON body is always `{}` — requirements travel in the
    // PAYMENT-REQUIRED header (base64), never in the body (SPEC.md §11.3).
    const body = await res.json()
    if (Object.keys(body).length !== 0) {
      throw new Error(`402 body must be {}, got ${JSON.stringify(body)}`)
    }

    const headerB64 = res.headers.get('PAYMENT-REQUIRED')
    if (!headerB64) throw new Error('missing PAYMENT-REQUIRED response header')
    const decoded = decodePaymentRequiredHeader(headerB64)
    const accept = decoded.accepts?.[0]
    if (!accept) throw new Error('decoded header carries no accepts[0]')

    if (accept.scheme !== 'exact') throw new Error(`bad scheme: ${accept.scheme}`)
    if (accept.network !== CAIP2_NETWORK) throw new Error(`bad network: ${accept.network}`)
    if (accept.asset !== USDC_ASA_ID) throw new Error(`bad asset: ${accept.asset}`)
    if (accept.amount !== '1000') throw new Error(`bad amount: ${accept.amount}`)
    // G5: a bare equality check against PAY_TO proves nothing when the
    // proxy is misconfigured — an empty (or malformed) PAY_TO would equal
    // an equally empty advertised payTo. Assert the shape independently:
    // 58-char base32 with a valid checksum (algosdk.isValidAddress), then
    // assert it matches the configured value.
    if (!algosdk.isValidAddress(accept.payTo)) {
      throw new Error(`bad payTo: "${accept.payTo}" is not a valid Algorand address`)
    }
    if (accept.payTo !== PAY_TO) throw new Error(`bad payTo: ${accept.payTo}`)
    if (accept.extra?.asset !== USDC_ASA_ID)
      throw new Error(`bad extra.asset: ${accept.extra?.asset}`)
    if (accept.extra?.tag !== 'x402-global-challenge') {
      throw new Error(`bad extra.tag: ${accept.extra?.tag}`)
    }

    // Independently resolve the expected fee payer straight from the
    // facilitator, the same way proxy/src/x402/server.ts#boot() did — never
    // hardcoded, never assumed.
    const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL })
    const supported = await facilitator.getSupported()
    const expectedFeePayer = resolveFeePayer(supported, CAIP2_NETWORK)
    if (accept.extra?.feePayer !== expectedFeePayer) {
      throw new Error(`bad extra.feePayer: ${accept.extra?.feePayer}, want ${expectedFeePayer}`)
    }
  })

  // ── 3. Zero-coverage lockfile: 200, free, signed attestation ─────────────
  const lockfileBytes = Buffer.from(
    JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/left-pad': { version: '1.3.0' } },
    }),
  )
  let attestation
  await check('lockfile (zero-coverage): 200 free, signed attestation', async () => {
    const res = await fetch(`${PROXY_URL}/v1/attest/lockfile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: lockfileBytes,
    })
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
    if (res.headers.get('PAYMENT-REQUIRED')) {
      throw new Error('a zero-coverage lockfile must never carry a PAYMENT-REQUIRED header')
    }
    const data = await res.json()
    if (data.summary?.reviewed !== 0)
      throw new Error(`expected 0 reviewed, got ${data.summary?.reviewed}`)
    if (!data.attestation?.signatures?.length) throw new Error('no signature on the attestation')
    attestation = data.attestation
  })

  // ── 4. Offline verification — reuse the CLI verifier, never reimplement ──
  await check('attestation verifies offline (spm verify)', async () => {
    if (!attestation) throw new Error('no attestation captured from check 3')
    const seedHex = process.env.ATTEST_SIGNING_KEY
    if (!seedHex) throw new Error('ATTEST_SIGNING_KEY not set in this process')
    const seedBytes = Uint8Array.from(Buffer.from(seedHex, 'hex'))
    const { loadSigningKey } = await import('../proxy/src/attest/keys.js')
    const signingKey = await loadSigningKey(seedBytes)
    const keyArg = `${signingKey.keyid}:${Buffer.from(signingKey.publicKey).toString('base64')}`

    const envelopePath = path.join(tmpDir, 'lockfile-attestation.json')
    fs.writeFileSync(envelopePath, JSON.stringify(attestation))
    const lockfilePath = path.join(tmpDir, 'package-lock.json')
    fs.writeFileSync(lockfilePath, lockfileBytes)

    const { runVerify } = await import('../cli/src/verify.js')
    const code = await runVerify([envelopePath, '--lockfile', lockfilePath, '--key', keyArg])
    if (code !== 0) throw new Error('spm verify exited non-zero — see output above')
  })

  // ── 5. Status API: row shape, and unknown version -> UNREVIEWED ──────────
  await check('status API: row shape for a reviewed package', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/${PAID_PKG}/${PAID_VER}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    for (const key of [
      'pkg',
      'version',
      'status',
      'auditor_addr',
      'anchor_txid',
      'ts',
      'integrity',
    ]) {
      if (!(key in data)) throw new Error(`row missing key "${key}"`)
    }
    if (data.status !== 'COMMUNITY_REVIEWED') throw new Error(`got ${data.status}`)
  })

  await check('status API: unknown version -> UNREVIEWED', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/unknown-pkg-xyz-e2e/1.0.0`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'UNREVIEWED') throw new Error(`got ${data.status}`)
  })

  // ── 6. Auto-reset: version bump -> UNREVIEWED ─────────────────────────────
  await check('auto-reset: version bump -> UNREVIEWED', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/${PAID_PKG}/9.9.9-e2e-bump`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'UNREVIEWED') throw new Error(`got ${data.status}`)
  })

  // ── 7. Earnings ledger: free, reachable ───────────────────────────────────
  await check('earnings route: free, reachable', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/earnings/github/octocat`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (res.headers.get('PAYMENT-REQUIRED')) throw new Error('earnings must never be gated')
  })

  // ── 8. On-chain: paid install ────────────────────────────────────────────
  // WARNING: never print PASS here for a step that did not run. A missing
  // credential is a SKIP with the exact reason — never a FAIL, never a
  // silent PASS.
  const payerMnemonic = process.env.SPM_DONOR_MNEMONIC

  if (!payerMnemonic) {
    skip(
      'on-chain: paid install',
      'SPM_DONOR_MNEMONIC not set — no funded wallet in this environment',
    )
  } else {
    const ALGOD_SERVER =
      process.env.ALGOD_SERVER ??
      (NETWORK === 'testnet'
        ? 'https://testnet-api.algonode.cloud'
        : 'https://mainnet-api.algonode.cloud')
    const ALGOD_PORT = process.env.ALGOD_PORT ?? '443'
    const ALGOD_TOKEN = process.env.ALGOD_TOKEN ?? ''
    const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)

    let paymentTxid
    await check('on-chain: paid install -> plain USDC transfer, no inner txns', async () => {
      // Reuses the real MCP install tool — never a hand-rolled payment flow.
      const { installTool } = await import('../mcp/src/tools/install.js')
      const result = await installTool.handler({ pkg: PAID_PKG, version: PAID_VER })
      if (!result.tarballPath || !fs.existsSync(result.tarballPath)) {
        throw new Error('tarball not saved to disk')
      }
      if (result.status !== 'paid') throw new Error(`expected paid, got ${result.status}`)
      if (!result.txid) throw new Error('no settlement txid returned')
      paymentTxid = result.txid

      // The payment leg is a plain USDC transfer to payTo. PaymentRouter's
      // credit/claim step runs later and separately (see the SKIP below).
      const info = await algod.pendingTransactionInformation(result.txid).do()
      const innerTxns = info.innerTxns ?? info['inner-txns'] ?? []
      if (innerTxns.length !== 0) {
        throw new Error(`payment txn must carry no inner transactions, found ${innerTxns.length}`)
      }
      console.log(`\n    Settlement: ${result.txid}`)
      console.log(`    Lora: ${loraUrl(result.txid)}`)
      return result.txid
    })

    if (paymentTxid) console.log(`  (payment txid: ${paymentTxid})`)
  }

  // ── 9. On-chain: PaymentRouter 250-package credit/claim rehearsal ───────
  const onChainReason = onChainRehearsalSkipReason(NETWORK, process.env)
  if (onChainReason) {
    skip('on-chain: PaymentRouter 250-pkg credit/claim rehearsal', onChainReason)
  } else {
    await runOnChainRehearsal(loraUrl)
  }

  console.log('===========================')
  console.log(`E2E: ${passed} passed, ${failed} failed, ${skipped} skipped`)
  if (failed === 0) {
    console.log('E2E: PASS')
    process.exit(0)
  } else {
    console.log(`E2E: FAIL (${failed} check(s) failed)`)
    process.exit(1)
  }
}

// Guarded so scripts/e2e.test.mjs can import this module's pure
// onChainRehearsalSkipReason export without running the whole e2e suite —
// mirrors every other dual-purpose script in this directory (network.mjs,
// rekey-payto.mjs, claim.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('E2E: FAIL', e.stack ?? e.message)
    process.exit(1)
  })
}
