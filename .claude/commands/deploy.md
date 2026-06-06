---
description: Compile + deploy SplitRouter to TestNet and opt-in all recipients
allowed-tools: Read, Write, Edit, Bash
---
Use the algorand-contract-engineer subagent to:
1. Build SplitRouter on LocalNet, run the split-sum unit test.
2. Deploy to TestNet via contracts/scripts/setup.ts.
3. setRecipients(...) and opt the app + 5 recipients into USDC ASA 10458941.
4. Print APP_ID and APP_ADDRESS and write them into .env.
