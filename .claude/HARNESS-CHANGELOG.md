# Harness change log

Each entry states what changed, why it changed, and the expected effect.
Newest first.

---

## 2026-09-21 — Align the harness with the MainNet design

**`CLAUDE.md` rewrite.**
- What: cut from 158 lines to about 100. Removed the `@AGENTS.md` import (211 lines of
  generic Algorand text). Removed the dependency-security block that `AGENTS.md` repeats.
  Added a numbered invariant list, a facts table, a command block, sandbox cautions, and
  orchestration rules.
- Why: every session loaded about 370 lines, and most of it did not apply to the task.
- Expected effect: a smaller fixed context per session. Facts appear in one place only.

**Skills.**
- What: rewrote `spm-split-contract` and `spm-testing`. Removed hackathon text from
  `spm-audit-status`.
- Why: `spm-split-contract` taught the deleted per-payment `pay()` split, which breaks
  invariant 2. `spm-testing` described LocalNet and TestNet gates that no longer exist.
- Expected effect: agents that load these skills get the current design.

**Subagents.**
- What: rewrote `algorand-contract-engineer`, `integration-tester`, `mcp-payer-engineer`
  and `scope-sentinel` for MainNet. Added a 15-line report format with a status first line
  and a BLOCKED rule to every implementing agent.
- Why: the old definitions said "12h hackathon", "TestNet", "hr8 sync" and `pay()`.
- Expected effect: short reports and no drift back to the TestNet design.

**Commands.**
- What: deleted `/demo`, `/deploy`, `/e2e` and `/seed`. Rewrote `/verify`.
- Why: `/seed` told an agent to create a `COMMUNITY_REVIEWED` row without a human
  review, which breaks invariant 5. The other three targeted TestNet and `DEMO.md`.
- Expected effect: no command runs a superseded flow.

**Other.**
- What: deleted `bootstrap.sh`. Added `.claude/worktrees/` to `.gitignore`.
- Why: `bootstrap.sh` overwrote the harness with the hackathon versions. Biome reads
  `.gitignore`, so an ignored worktree directory keeps `biome ci .` from linting it.
- Expected effect: no accidental harness rollback, and a clean lint during parallel work.

**Worktree base caution.**
- What: `CLAUDE.md` tells the orchestrator to put `git reset --hard <HEAD sha>` first in
  every worktree subagent prompt.
- Why: `isolation: worktree` checked out `master`. Two subagents first saw hackathon-era
  files and spent turns repairing their base.
- Expected effect: subagents start on the correct commit.

**Not changed (write-protected; needs a human).** `.claude/settings.json` sets
`USDC_ASA_ID=10458941` and a TestNet `ALGOD_SERVER` in every session's environment. It
also allows `npm:*` and `npx:*`, which conflicts with the pnpm-only rule.

---

## 2026-09-19 — Install `rtk` and document its use

**What.** Installed `rtk` v0.49.0 to `~/.local/bin/rtk`, pinned by `RTK_VERSION`.
Ran `rtk init`, which appended a marker-guarded block to `CLAUDE.md` and created
`.rtk/filters.toml`. Rewrote that block to describe explicit use, list the
subcommands that help this repository, and forbid verifying an acceptance check
against filtered output.

**Why.** `rtk` condenses verbose command output before it reaches the context
window. Diff review is the single largest recurring token cost in this workflow.

**Vetting.** The installer is the primary distribution path and runs as
`curl | sh`, which is the anti-pattern this project exists to fight. The script
was downloaded and read in full before execution. It verifies a SHA-256 checksum
against a published `checksums.txt` and refuses to install on mismatch, rejects
archive entries containing absolute paths or `..`, installs under `$HOME`
without sudo, and makes no telemetry call. CAUTION: repository metadata could
not be verified. The GitHub API is scope-gated in this environment and returned
403, so the star count shown on the project page is unconfirmed.

**Expected effect.** Measured on this repository: `git diff` output fell from
70,192 to 29,258 bytes, a 58% reduction. Small outputs pass through unchanged.

**Deliberate omission.** The global auto-hook (`rtk init -g`) is **not**
installed. It would filter every command in every session. This orchestrator
verifies subagent claims by reading raw command output, and filtered output
could hide a detail that a verification depends on.

---

## 2026-09-19 — Add Biome, an invariant guard, git hooks, and CI

**What.** Added `biome.json`, `scripts/guard.sh`, `.githooks/pre-commit`, and
`.github/workflows/ci.yml`. Set `core.hooksPath` to `.githooks`.

**Why.** The repository had no linter, no formatter, no pre-commit gate, and no
continuous integration. Several project invariants existed only as prose in
`CLAUDE.md`, so nothing detected a violation until a human read the diff.

**Design note.** `husky` and `lint-staged` were rejected. Both add postinstall
scripts, and `CLAUDE.md` blocks postinstall scripts. A plain `core.hooksPath`
needs no dependency at all.

**Expected effect.** The guard script turns seven prose invariants into exit
codes, including the deleted settlement bypass, the `algosdk.signBytes` trap,
float arithmetic on money, and committed secret material.

---

## 2026-09-19 — Repair stale agent and skill directives

**What.** Rewrote the non-negotiables in
`.claude/agents/x402-proxy-engineer.md` and most of
`.claude/skills/spm-x402-flow/SKILL.md`.

**Why.** Both still described the 12h hackathon design. The agent directive
required a direct-submit settlement fallback as "default-safe", named TestNet
constants, and named a single price tier. The skill described the obsolete
`[axfer, appcall pay(...)]` payment group.

**Observed failure this caused.** The proxy work item refused its task twice and
returned BLOCKED with zero file changes. It was correct to refuse: the task
contradicted its standing directive. The drift, not the agent, was the defect.

**Expected effect.** A proxy work item no longer receives contradictory
instructions, so it no longer stalls. The directive now forbids reintroducing a
direct-submit path, which is the security regression that matters most.

---

## 2026-09-19 — Rewrite project memory for MainNet, drop stale doc imports

**What.** Rewrote `CLAUDE.md`. Removed the `@docs/architecture.md`,
`@docs/scope-map.md`, `@docs/test-plan.md`, and `@docs/goals.md` imports. Added
an INVARIANTS section. Copied the v3 specification into the repository as
`SPEC-v3.md`.

**Why.** `CLAUDE.md` declared "Algorand TestNet only" and "do not add tracks",
both of which contradict the MainNet specification. The four imported documents
described the finished hackathon MVP and were injected into every subagent's
context on every run.

**Expected effect.** Two effects. Correctness: subagents stop receiving
instructions that contradict the specification. Cost: four stale documents no
longer load into every subagent context, which removes roughly 300 lines of
misleading text from every run.

**Note.** The specification is now a tracked file, so a subagent can read the
relevant section directly instead of having it pasted into its prompt.

## 2026-09-20 — Close the CI test-gate gap

**What.** Added `pnpm -C cli test` and
`node --test .github/actions/spm-attest/attest.test.mjs` to
`.github/workflows/ci.yml`. Rewrote the root `test` script in `package.json` to
run the same five suites.

**Why.** CI ran proxy, contracts and mcp only. The cli suite and the action
suite were unreachable from any gate. The action suite asserts that no wallet
credential reaches the network, so it is a security gate that nothing ran.

**Expected effect.** A regression in the cli or the action now fails CI. A local
`pnpm test` and a CI run now check the same set, so a passing local run no
longer hides a CI failure.
