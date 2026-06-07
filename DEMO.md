# SPM demo runbook (documented + tested)

The demo is "done" only when `NETWORK=testnet bash scripts/demo.sh` exits 0 and prints
`DEMO: PASS` + a Lora URL. Rehearse it; record a backup video. ~90 seconds on stage.

## Pre-stage checklist
- [ ] SplitRouter deployed to TestNet; APP_ID/APP_ADDRESS in `.env`.
- [ ] 5 recipients + app opted into USDC ASA 10458941; payer wallet funded (ALGO + USDC).
- [ ] DB seeded: one COMMUNITY_REVIEWED package (paid) + one UNREVIEWED (free) — `/seed`.
- [ ] `bash scripts/verify.sh` green on LocalNet; `NETWORK=testnet bash scripts/demo.sh` green.
- [ ] Lora open; backup video on disk.

## Script (what you say + do)
1. **Free tier.** Agent calls `check_audit_status` then installs an UNREVIEWED package.
   Instant, no wallet. "Unreviewed packages are free — same as npm today."
2. **Paid, agentic.** Agent calls `install_audited_package("lodash","<ver>")`. It hits
   402, signs+pays USDC autonomously, install completes. "The agent paid — no human, no
   subscription, no API key."
3. **On-chain proof.** Open the printed Lora URL: one group txn, five inner transfers
   500/200/150/100/50 µUSDC to auditor/maintainer/adversarial/treasury/ops. "Five parties
   paid atomically, per download."
4. **The hook.** `curl /api/v1/status/lodash/<ver>` shows the status + attestation txid;
   then note a version bump resets to UNREVIEWED. "That bump is exactly where supply-chain
   attacks inject — and where the next bounty appears."
5. (Optional) Live `submit_audit` flip, or the Quantoz EURD-denominated install.

## Fallbacks
- TestNet slow/flaky: switch the narration to the recorded video; still open a prior Lora txn.
- Facilitator down: proxy uses direct algosdk submit (default). No demo change.
- Anything red in `scripts/demo.sh`: do NOT demo live — play the video.
