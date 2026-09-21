# Handoff — next session

## 0. State

Branch `spm-spec-closeout`, on top of `spm-mainnet` (`fd18e60`). Not pushed.
The sandbox blocks SSH to github.com.

`bash scripts/verify.sh` prints `VERIFY: PASS` at `6ae80ad`, e2e SKIP. Run it
with the Bash sandbox disabled.

Built this session:
- The reconciliation runner (`pnpm -C proxy reconcile`).
- The boot guard's `x402Version` check.
- Donation opt-in on every client (`spm attest`, MCP `allowDonation`, Action
  `donate` input).
- The composite Action now runs `spm attest` from its own checkout.
- The old spec file renamed to `SPEC.md`. Stale hackathon docs deleted.

`cd89fbb` regenerated the contract artifacts. `92a3831` fixed the build
runbook to match. Skip `docs/RUNBOOK-contract-build.md` unless the contract
source changes again.

---

## 1. Ordered next steps

1. **Decide the `payTo` variant before any call.** `payTo` is the
   competition leaderboard key.
   - Variant A, the default: `payTo` is the application address. Call
     `setRecipients` and never call `setPayTo`.
   - Variant B, the rekey path: `payTo` is a plain account rekeyed to the
     application. Call `setPayTo(<address>)` before `setRecipients`.
     WARNING: opt into USDC first, then rekey. A rekeyed account cannot sign
     its own opt-in.

   `setPayTo` fixes `payTo` only while it holds zero USDC. It asserts
   `payTo already holds revenue` once any arrives
   (`contracts/smart_contracts/split_router/contract.algo.ts`, `setPayTo`).
   Check: `NOTES.md` records the deployed app's chosen variant.

2. **Deploy and configure.** `cp .env.example .env`, set `NETWORK=mainnet`.
   WARNING: delete the bootstrap recipient-mnemonic block from the server's
   `.env`. The running server never needs a recipient key. Then run
   `bash scripts/verify.sh` — the e2e step must PASS, not SKIP.
   Check: `bash scripts/verify.sh` exits 0 with no SKIP line.

3. **Check attribution before anyone donates.** SPM writes the
   `x402-global-challenge` tag at settlement, not retroactively.
   ```bash
   curl -si "https://<domain>/v1/attest?name=ms&version=2.1.3" | grep -i "PAYMENT-REQUIRED"
   ```
   Decode the header and check `extra.tag`, `extra.asset` = `31566704`, and
   `extra.feePayer`. WARNING: the 402 body is `{}`. The requirements are in
   the header only.
   Check: the decoded header shows the three fields above.

4. **Seed real reviews.** A `COMMUNITY_REVIEWED` record with no stored
   `integrity` resolves to `UNREVIEWED` — enforced, not advisory. Target 15
   to 30 small, ubiquitous packages. Before reviewing, run the candidate
   list against 20 real package-lock.json files and record the median
   reviewed count in `NOTES.md` (SPEC.md §4.2). If it lands below 5, fix the
   seed list, not the price.
   Check: each seeded row has a stored `integrity` and resolves to
   `COMMUNITY_REVIEWED` through `/api/v1/status`.

5. **Reach the `distribute()` floor.** The floor is 100,000 microUSDC
   ($0.10). The caller must also pool at least 6,000 microALGO of fees.
   Five lockfile donations ($0.02 each) clear it. One $0.001 donation does
   not.
   Check: `distribute()` executed on MainNet with five inner transfers
   visible on Lora.

6. **Schedule `pnpm -C proxy reconcile`.** Human action: add a nightly cron
   or systemd timer on the host. Nothing schedules it today.
   Check: a scheduler entry exists, and the timer logs one run.

---

## 2. Open items

- **The reconciliation job has no scheduler.** `proxy/src/claims/reconcile-main.ts`
  runs the pass. Nothing calls it on a schedule. See step 6.
- **Payouts are manual.** `scripts/payout.ts` is dry-run by default and
  takes a key-file argument. Check every claim by hand.
- **A verified claim cannot be re-opened through the API.** Deliberate: it
  moves a payout address. The operator path is in
  `docs/RUNBOOK-mainnet-launch.md`.
- **Legal.** SPM will hold funds owed to third parties. For a German
  operator that may touch payment-services regulation. Get advice before
  paying anyone outside the team.
- **Post-MVP TODO (SPEC.md §14).** Publish the CLI to npm. Make the
  donation spend cap configurable.

---

## 3. Human-only items

- P0 donor recruitment.
- B1 MainNet provisioning.
- B3 public hosting.
- B6 the first real payment.
- C2 human package reviews.
- The §4.2 hit-rate measurement.
- D5 and D6 submissions.
- Delete `USDC_ASA_ID` and `ALGOD_SERVER` from `.claude/settings.json`. A
  human must edit it. Agents cannot write that file. It currently pins
  TestNet (`USDC_ASA_ID=10458941`) in every session and allows `npm:*` and
  `npx:*`.
