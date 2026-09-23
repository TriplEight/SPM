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
import { assertSqliteWriteAllowed } from './e2e-guard.mjs'

// Anchors a CJS `require()` at each workspace package's own node_modules —
// scripts/ has no node_modules of its own. Mirrors the pattern already
// established for algosdk imports in this file.
const requireFromProxy = createRequire(new URL('../proxy/package.json', import.meta.url))

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
  const algosdk = requireFromProxy('algosdk')

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

  // The old permissionless split contract is gone. PaymentRouter's on-chain
  // credit()/claim() step has no e2e check yet — R3 adds it. This is a real
  // gap, not a silent pass.
  skip('on-chain: PaymentRouter credit/claim', 'not yet implemented in this script — see R3')

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

main().catch((e) => {
  console.error('E2E: FAIL', e.stack ?? e.message)
  process.exit(1)
})
