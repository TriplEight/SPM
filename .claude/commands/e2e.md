---
description: Run the full agent -> 402 -> pay -> split -> install end-to-end check
allowed-tools: Read, Bash, Grep, Glob
---
Use the integration-tester subagent to run its full checklist against TestNet and
return a go/no-go for the demo, including the Lora URL for the settlement txn.
