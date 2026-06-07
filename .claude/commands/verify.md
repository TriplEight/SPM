---
description: Run the full verification harness (typecheck + unit + integration + LocalNet E2E)
allowed-tools: Read, Bash, Grep, Glob
---
Run `bash scripts/verify.sh` and show the full output. Report which checks PASS/FAIL and
the exit code. If anything FAILs, summarize the first failing check and the likely owner
subagent. Do not modify tests to make them pass. This is the G4 completion signal.
