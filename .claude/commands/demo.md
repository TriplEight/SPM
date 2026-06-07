---
description: Run the documented, tested demo path end-to-end and print the Lora URL
argument-hint: "[network: localnet|testnet, default testnet]"
allowed-tools: Read, Bash, Grep, Glob
---
Run `NETWORK=${ARGUMENTS:-testnet} bash scripts/demo.sh`, show the output, and confirm it
printed `DEMO: PASS` plus a Lora URL for the settlement group with 5 inner transfers.
Then echo the demo runbook steps from DEMO.md so the operator can follow along live.
