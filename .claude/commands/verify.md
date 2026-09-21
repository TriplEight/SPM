---
description: Run the verification harness and report PASS/FAIL per check
allowed-tools: Read, Bash, Grep, Glob
---
Run `bash scripts/verify.sh > "$TMPDIR/verify.log" 2>&1` with the Bash sandbox disabled.
Report the exit code and the summary block at the end of the log.
For each FAIL, quote the first failing assertion from that check's log and name the owner
directory. Never modify a test to make it pass.
