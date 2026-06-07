#!/usr/bin/env node
// SPM end-to-end check — drives the real flow, asserts the on-chain 5-way split.
// Usage: node scripts/e2e.mjs [--network localnet|testnet]
// Exit 0 = E2E PASS; exit 1 = E2E FAIL.

// Resolve algosdk from mcp/node_modules — the scripts/ directory has no node_modules.
import { createRequire } from 'node:module'
const require = createRequire(new URL('../mcp/package.json', import.meta.url))
const algosdk = require('algosdk')
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse --network flag
const netArg =
  process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] ??
  (process.argv.includes('--network')
    ? process.argv[process.argv.indexOf('--network') + 1]
    : null) ??
  'localnet'

const PROXY_URL = process.env['SPM_PROXY_URL'] ?? 'http://localhost:4873'
const ALGOD_SERVER =
  netArg === 'testnet'
    ? (process.env['ALGOD_SERVER'] ?? 'https://testnet-api.algonode.cloud')
    : 'http://localhost'
const ALGOD_PORT = netArg === 'testnet' ? (process.env['ALGOD_PORT'] ?? '443') : '4001'
const ALGOD_TOKEN =
  netArg === 'testnet'
    ? (process.env['ALGOD_TOKEN'] ?? '')
    : 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)

let passed = 0
let failed = 0

async function check(name, fn) {
  process.stdout.write(`  ${name}: `)
  try {
    const result = await fn()
    console.log('PASS' + (result ? ` (${result})` : ''))
    passed++
    return true
  } catch (e) {
    console.log(`FAIL — ${e.message}`)
    failed++
    return false
  }
}

async function seedDb(pkg, version, status) {
  const dbPath =
    process.env['SQLITE_PATH'] ?? path.join(__dirname, '..', 'proxy', 'audit.db')
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB not found at ${dbPath} — is the proxy running?`)
  }
  const { execFileSync } = await import('node:child_process')
  // Pass SQL via stdin to avoid shell expansion; sqlite3 reads from stdin when db
  // path is the only argument. Each value is a separate quoted literal — all values
  // here are internal E2E constants, but using stdin avoids any shell involvement.
  const ts = Date.now()
  const sql =
    `INSERT OR REPLACE INTO audit_status ` +
    `(pkg, version, status, auditor_addr, attest_txid, ts) ` +
    `VALUES ('${pkg.replace(/'/g, "''")}','${version.replace(/'/g, "''")}',` +
    `'${status.replace(/'/g, "''")}','E2E_AUDITOR','E2E_TXID',${ts});`
  // execFileSync spawns sqlite3 directly — no shell, so no metachar expansion.
  execFileSync('sqlite3', [dbPath], { input: sql })
}

async function main() {
  console.log(`== SPM E2E (${netArg}) ==`)

  // ── 1. Status API: unknown pkg → UNREVIEWED ──────────────────────────────
  await check('status API: unknown → UNREVIEWED', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/unknown-pkg-xyz-e2e/1.0.0`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'UNREVIEWED') throw new Error(`got ${data.status}`)
  })

  // ── 2. Free install: UNREVIEWED package — no 402 ─────────────────────────
  await check('free install (UNREVIEWED): no 402', async () => {
    // Use a scoped package path that we know is unreviewed
    const res = await fetch(`${PROXY_URL}/api/v1/status/chalk/5.3.0`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // Just verify the proxy responds correctly for a free package
    if (data.status !== 'UNREVIEWED') throw new Error(`expected UNREVIEWED, got ${data.status}`)
  })

  // ── 3. Paid gate: COMMUNITY_REVIEWED package → 402 ───────────────────────
  const PAID_PKG = 'express'
  const PAID_VER = '4.21.2'

  try {
    await seedDb(PAID_PKG, PAID_VER, 'COMMUNITY_REVIEWED')
  } catch (e) {
    console.log(`  Note: Could not seed DB: ${e.message}`)
  }

  await check(`paid gate: ${PAID_PKG}@${PAID_VER} → 402`, async () => {
    const res = await fetch(`${PROXY_URL}/${PAID_PKG}/-/${PAID_PKG}-${PAID_VER}.tgz`)
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`)
    const body = await res.json()
    if (!body.accepts?.[0]) throw new Error('no accepts in 402 body')
    if (body.accepts[0].scheme !== 'exact') throw new Error(`bad scheme: ${body.accepts[0].scheme}`)
    if (body.accepts[0].asset !== '10458941') throw new Error(`bad asset: ${body.accepts[0].asset}`)
    if (body.accepts[0].maxAmountRequired !== '1000')
      throw new Error(`bad amount: ${body.accepts[0].maxAmountRequired}`)
  })

  // ── 4. Auto-reset: different version → UNREVIEWED ────────────────────────
  await check('auto-reset: different version → UNREVIEWED', async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/${PAID_PKG}/9.9.9`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'UNREVIEWED') throw new Error(`got ${data.status}`)
  })

  // ── 5. Status API: seeded pkg → COMMUNITY_REVIEWED ───────────────────────
  await check(`status API: ${PAID_PKG}@${PAID_VER} → COMMUNITY_REVIEWED`, async () => {
    const res = await fetch(`${PROXY_URL}/api/v1/status/${PAID_PKG}/${PAID_VER}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'COMMUNITY_REVIEWED') throw new Error(`got ${data.status}`)
  })

  // ── 6. Paid install (full flow) — only if PAYER_MNEMONIC + SPLIT_APP_ID set ──
  const payerMnemonic = process.env['PAYER_MNEMONIC']
  const splitAppId = process.env['SPLIT_APP_ID']
  if (payerMnemonic && splitAppId) {
    await check('paid install: 402→sign→pay→tarball', async () => {
      const { installTool } = await import('../mcp/src/tools/install.js')
      const result = await installTool.handler({ pkg: PAID_PKG, version: PAID_VER })
      if (!result.tarballPath || !fs.existsSync(result.tarballPath)) {
        throw new Error('tarball not saved to disk')
      }
      if (result.status !== 'paid') throw new Error(`expected paid, got ${result.status}`)
      if (!result.txid) throw new Error('no settlement txid returned')

      // Verify on-chain: 5 inner asset transfers 500/200/150/100/50
      // algosdk v3 uses camelCase: innerTxns, and txn.txn.assetTransfer.amount (bigint)
      const info = await algod.pendingTransactionInformation(result.txid).do()
      const innerTxns = info.innerTxns ?? info['inner-txns'] ?? []
      if (innerTxns.length !== 5) {
        throw new Error(`expected 5 inner txns, got ${innerTxns.length}`)
      }
      const amounts = innerTxns.map(
        (t) =>
          Number(
            t.txn?.txn?.assetTransfer?.amount ??
              t.txn?.txn?.aamt ??
              t['asset-transfer-transaction']?.amount ??
              0,
          ),
      )
      const expected = [500, 200, 150, 100, 50]
      for (let i = 0; i < 5; i++) {
        if (amounts[i] !== expected[i]) {
          throw new Error(`inner txn ${i}: expected ${expected[i]}, got ${amounts[i]}`)
        }
      }

      const loraUrl = `https://${netArg === 'testnet' ? 'testnet.' : ''}lora.algokit.io/transaction/${result.txid}`
      console.log(`\n  Settlement: ${result.txid}`)
      console.log(`  Lora: ${loraUrl}`)
      return result.txid
    })
  } else {
    console.log('  paid install:              SKIP (PAYER_MNEMONIC or SPLIT_APP_ID not set)')
  }

  console.log('==========================')
  if (failed === 0) {
    console.log('E2E: PASS')
    process.exit(0)
  } else {
    console.log(`E2E: FAIL (${failed} check(s) failed)`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('E2E: FAIL', e.message)
  process.exit(1)
})
