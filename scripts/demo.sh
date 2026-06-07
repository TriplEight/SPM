#!/usr/bin/env bash
# Runs the documented demo path end-to-end and prints the Lora URL. The G5 demo gate.
# NETWORK defaults to testnet (the live stage network).
set -uo pipefail
NETWORK="${NETWORK:-testnet}"
echo "== SPM demo ($NETWORK) =="
if node scripts/e2e.mjs --network "$NETWORK"; then
  echo "DEMO: PASS"
  echo "Follow DEMO.md for the live walkthrough. Open the printed Lora URL on stage."
  exit 0
else
  echo "DEMO: FAIL — see DEMO.md fallback (play the recorded video)."
  exit 1
fi
