---
description: Seed the SQLite audit_status table with demo packages
argument-hint: "[optional package@version to add as COMMUNITY_REVIEWED]"
allowed-tools: Read, Write, Edit, Bash
---
Seed proxy/ SQLite `audit_status` for the demo:
- one COMMUNITY_REVIEWED package (paid path) — use $ARGUMENTS if given, else a pinned lodash version
- one or two UNREVIEWED packages (free path)
Then print the rows so we can confirm the two-branch demo story.
