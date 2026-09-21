# Handoff — next session

## 0. State

Branch `spm-launch-tooling`, on top of `master` (`0be2758`, PR #18
`spm-spec-closeout` merged). Not pushed. The sandbox blocks SSH to
github.com.

`bash scripts/verify.sh` prints `VERIFY: PASS` on this branch. e2e: 9 passed,
1 SKIP (the on-chain step — no funded wallet or deployed contract yet). Run
it with the Bash sandbox disabled.

Built this session:
- `b48d302` removes the TestNet pins (`USDC_ASA_ID`, `ALGOD_SERVER`) and the
  `npm:*`/`npx:*` allows from `.claude/settings.json`. This commit closes
  the old §3 human-only item about that file.
- `scripts/check-402.mjs`, the step 3 attribution check. It exits 0 only if
  tag, asset, network, and feePayer all PASS.
- `scripts/hit-rate.mjs`, the SPEC.md §4.2 seed-list median measurement for
  step 4.
- `deploy/systemd/spm-reconcile.{service,timer}` for step 6. A human installs
  them.
- `scripts/verify.sh` now runs `unit:scripts`
  (`node --test scripts/*.test.mjs`).

The user decided the `payTo` variant: Variant A. `payTo` is the SplitRouter
application address. Call `setRecipients` only. Never call `setPayTo`. The
app is not deployed yet.

WARNING (worktree quirk): a worktree subagent cannot check out a commit that
changes `.claude/settings.json` — the sandbox write-protects that file. Start
worktree agents from `master`, not from this branch.

---

## 1. Ordered next steps

0. **Push `spm-launch-tooling` and merge it.** Run
   `git push -u origin spm-launch-tooling` outside the sandbox. Open a PR
   into `master`. Check: CI is green on the PR, and the PR merges.
1. **Deploy with Variant A.** The user decided the `payTo` variant: `payTo`
   is the SplitRouter application address. Call `setRecipients` only.
   WARNING: never call `setPayTo`. `setPayTo` fixes `payTo` only while it
   holds zero USDC. It asserts `payTo already holds revenue` once any
   arrives (`contracts/smart_contracts/split_router/contract.algo.ts`,
   `setPayTo`).
   Check: `NOTES.md` records the deployed app id and Variant A after deploy.

2. **Deploy and configure.** `cp .env.example .env`, set `NETWORK=mainnet`.
   WARNING: delete the bootstrap recipient-mnemonic block from the server's
   `.env`. The running server never needs a recipient key. Then run
   `bash scripts/verify.sh` — the e2e step must PASS, not SKIP.
   Check: `bash scripts/verify.sh` exits 0 with no SKIP line.

3. **Check attribution before anyone donates.** SPM writes the
   `x402-global-challenge` tag at settlement, not retroactively.
   ```bash
   node scripts/check-402.mjs "https://<domain>/v1/attest?name=ms&version=2.1.3"
   ```
   WARNING: the 402 body is `{}`. The requirements are in the header only;
   the script decodes it and checks `extra.tag`, `extra.asset`, `network`,
   and `extra.feePayer` against the facilitator's live `getSupported()`.
   Check: the script exits 0 and prints PASS for all four fields.

4. **Seed real reviews.** A `COMMUNITY_REVIEWED` record with no stored
   `integrity` resolves to `UNREVIEWED` — enforced, not advisory. Target 15
   to 30 small, ubiquitous packages. Before reviewing, run the candidate
   list against 20 real package-lock.json files and record the median
   reviewed count in `NOTES.md` (SPEC.md §4.2). If it lands below 5, fix the
   seed list, not the price.
   ```bash
   node scripts/hit-rate.mjs candidates.txt <lockfiles-dir>
   ```
   Check: each seeded row has a stored `integrity` and resolves to
   `COMMUNITY_REVIEWED` through `/api/v1/status`.

5. **Reach the `distribute()` floor.** The floor is 100,000 microUSDC
   ($0.10). The caller must also pool at least 6,000 microALGO of fees.
   Five lockfile donations ($0.02 each) clear it. One $0.001 donation does
   not.
   Check: `distribute()` executed on MainNet with five inner transfers
   visible on Lora.

6. **Install the reconciliation timer.** Human action: install
   `deploy/systemd/spm-reconcile.service` and `spm-reconcile.timer` on the
   host. Procedure: `docs/RUNBOOK-mainnet-launch.md` section 6.
   Check: `systemctl list-timers spm-reconcile.timer` shows a next run, and
   `journalctl -u spm-reconcile.service` shows one successful pass.

---

## 2. Open items

- **The reconciliation timer is not installed.** `proxy/src/claims/reconcile-main.ts`
  runs the pass. `deploy/systemd/spm-reconcile.{service,timer}` schedule it,
  but installing them on the host is a human action. See step 6.
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
