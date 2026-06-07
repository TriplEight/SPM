# SPM test plan (imported into project memory)

Goal-mode judges "done" by command output in the transcript. Every component below
has tests that a single harness runs. Loop on LocalNet; TestNet only for the final pass.

## Stack
- Contract: vitest + @algorandfoundation/algokit-utils against AlgoKit LocalNet.
- Proxy: vitest + Hono's built-in test client (`app.request(...)`). SQLite in a temp file.
- MCP/CLI: vitest; drive the MCP tools against a local proxy + LocalNet app.
- E2E/demo: `scripts/e2e.mjs` (node, tsx-runnable) driving the real flow + on-chain asserts.

## Required npm scripts (wire in root package.json)
- `test`       -> run all workspace vitest suites (unit + integration).
- `typecheck`  -> `tsc -b` (or per-package `tsc --noEmit`).
- (Optional) `lint`.
`scripts/verify.sh` calls these + a LocalNet E2E. `scripts/demo.sh` runs E2E on $NETWORK.

## Unit tests
### contracts/ (SplitRouter)
- split-sum: a pay() of UNIT (1000) emits exactly 5 inner axfers 500/200/150/100/50 to the
  5 configured recipients; their sum == UNIT.
- reject wrong-asset: pay() with a non-ASSET_ID axfer fails.
- reject wrong-amount: pay() with amount != UNIT fails.
- reject wrong-receiver: payment not addressed to the app fails.
- attest-auth: attest() from a non-authorizedAuditor fails; from authorizedAuditor writes
  box `attest:<pkg>@<ver>` with the expected fields.
### proxy/
- free passthrough: GET an UNREVIEWED package -> 200 + tarball, no 402, no wallet.
- paid gate: GET a COMMUNITY_REVIEWED package -> 402 with PaymentRequirements
  (scheme "exact", asset "10458941", payTo app addr, maxAmountRequired "1000").
- status API: GET /api/v1/status/:pkg/:version returns the row shape; unknown -> UNREVIEWED.
- auto-reset: a version with no row resolves to UNREVIEWED.
### mcp/ + cli/
- check_audit_status returns status without payment.
- install_audited_package on a 402 builds an atomic group [USDC axfer->app]+[appcall pay]
  with correct asset/amount/args (assert the constructed group, signed locally).

## Integration / system tests (LocalNet)
- proxy <-> contract: a real pay() group submitted via the proxy settles; proxy confirms
  the 5 inner txns before returning 200.
- mcp <-> proxy <-> contract: install_audited_package end-to-end returns tarball +
  X-AUDIT-ATTESTATION; balances of the 5 recipients increased by 500/200/150/100/50.
- attest -> status flip: attest() then GET status shows COMMUNITY_REVIEWED + attest_txid.

## E2E (scripts/e2e.mjs) — the goal/demo gate
Runs against --network localnet (default for loops) or testnet (final/demo). Asserts:
1. Free install of an UNREVIEWED package succeeds with zero payment.
2. install_audited_package on the seeded COMMUNITY_REVIEWED package returns a tarball.
3. The settlement group on-chain has exactly 5 inner axfers 500/200/150/100/50 to the 5
   recipients (read via algosdk/indexer). Print the group txid + Lora URL.
4. GET /api/v1/status returns COMMUNITY_REVIEWED + attest_txid.
5. Version bump -> status resolves to UNREVIEWED.
Exit 0 only if all pass; print `E2E: PASS` / `E2E: FAIL <reason>`.

## Definition of done (per sync point)
- S2: `npm test` green for contracts split/reject/attest + proxy gate tests (LocalNet).
- S3: contract on TestNet; integration tests green on LocalNet; MCP builds the real group.
- S4: `bash scripts/verify.sh` exits 0 AND `bash scripts/demo.sh` exits 0 on TestNet.
