# SPM

SPM is an npm-compatible registry overlay for the Global x402 Challenge on Algorand MainNet.
- Unreviewed packages pass through to npm for free.
- Human-reviewed packages return HTTP 402. The caller pays USDC through the GoPlausible facilitator.
- USDC accrues at one fixed `payTo`. `SplitRouter.distribute()` fans it out 50/20/15/10/5.
- `POST /v1/attest/lockfile` is the volume route. It returns a signed attestation for a lockfile.

**Spec: `SPEC.md`.** Current state and next steps: `docs/HANDOFF-next-session.md`.
Operator procedures: `docs/RUNBOOK-*.md`. Session log: `NOTES.md`.
Generic Algorand and AlgoKit guidance: `AGENTS.md` (read only when you need it).

## Invariants

WARNING: every change preserves these. A violation costs money or a false security claim.

1. `payTo` is the leaderboard key. It changes only while it holds no USDC.
2. Never split per payment. Say "distributes atomically and permissionlessly".
   Never say "in the same transaction".
3. `extra = { asset, feePayer, tag: "x402-global-challenge" }` on every paid route.
   `asset` is always explicit. An omitted asset can resolve to ALGO.
4. Unreviewed never returns 402: tarball, single attest, and zero-coverage lockfile.
5. A `COMMUNITY_REVIEWED` record means a human read that exact tarball.
   Never create a review record in code, in a shipped fixture, or in a seed script.
6. The facilitator is mandatory. No local facilitator. No direct chain submission.
7. Money is integer micro-units. Never use floats.

`bash scripts/guard.sh` enforces the invariants that grep can see.

## Canonical facts

| Fact | Value |
|---|---|
| Packages | `@x402-avm/{core,avm,hono,fetch,extensions}` at 2.6.1. Never `@x402/*`. |
| MainNet CAIP-2 | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` |
| USDC ASA | MainNet 31566704. TestNet 10458941 (rehearsal only). 6 decimals. |
| Facilitator | `https://facilitator.goplausible.xyz`. Client method `getSupported()`, not `supported()`. |
| Prices (microUSDC) | lockfile 20,000; zero-coverage lockfile free; single attest 1,000; reviewed tarball 1,000 |
| Split per 1,000 | 500 / 200 / 150 / 100 / 50 |
| `distribute()` floor | `MIN_DISTRIBUTE` 100,000 microUSDC; outer fee at least 6,000 microALGO |
| Attestations | DSSE + in-toto Statement v1, ed25519, unfunded service key. Never `algosdk.signBytes`. |
| Single attest | `GET /v1/attest?name=@babel/core&version=7.25.2` (query params; scoped names contain `/`) |

`feePayer` comes from `getSupported()` at boot. Never hardcode it.
The attribution tag applies at settlement and is not retroactive.

## Repo map

| Path | Content | Subagent |
|---|---|---|
| `contracts/` | `SplitRouter` (Puya-TS) | `algorand-contract-engineer` |
| `proxy/` | Hono overlay, x402 routes, DSSE, SQLite status store, claims ledger | `x402-proxy-engineer` |
| `mcp/`, `cli/` | MCP payer, `spm` CLI with offline `spm verify` | `mcp-payer-engineer` |
| `.github/actions/spm-attest/` | CI Action. Fails open. Never reddens a user's CI. | — |
| `scripts/` | `verify.sh`, `guard.sh`, `e2e.mjs`, `payout.ts`, `reconcile.ts` | `integration-tester` |

Skills: `spm-x402-flow`, `spm-audit-status`, `spm-split-contract`, `spm-testing`.
Algorand reference skills: `algorand-core`, `algorand-typescript`, `algorand-x402-typescript`.
Scope questions go to `scope-sentinel`. The out-of-scope list is `SPEC.md` §10.

## Commands

```bash
export PATH=$HOME/.local/share/pnpm/bin:$PATH   # pnpm is not on the default agent PATH
pnpm typecheck
pnpm -C proxy test      # also contracts, mcp, cli
bash scripts/verify.sh  # all checks; prints VERIFY: PASS
pnpm exec biome ci .    # zero warnings
```

CAUTION: run proxy tests and `verify.sh` with the Bash sandbox disabled.
The sandbox blocks the unix sockets that the subprocess tests use.

CAUTION: contract tests run in JavaScript. They do not prove Puya compilation.
A human runs `algokit project run build` after a contract change.

Never weaken an assertion to make a check pass.

## Working rules

- pnpm only. Pin exact: `pnpm add --save-exact <pkg>@<version>`. Justify each new dependency.
- Run `pnpm audit --audit-level=moderate` after you add a dependency.
- Secrets live in `.env` (gitignored). Pool mnemonics are cold and never touch the server.
- Never log or hardcode a mnemonic or a private key.
- No AI attribution in code, comments, docs, or commits.
- After a unit of work, append a dated entry to `NOTES.md` (`/handoff`).
- Redirect long output to `$TMPDIR/<name>.log`. Read the exit code and the last 30 lines.
- Search before you read. Read line ranges, not whole files.

## Orchestration

- One work item per subagent. Give it the spec excerpt, the file list, and the acceptance checks.
- Parallel subagents each get their own worktree (`.claude/worktrees/`, gitignored).
  CAUTION: a new worktree starts from `master`, not from the current branch. Put
  `git reset --hard <current HEAD sha>` as step 1 of every worktree subagent prompt.
- A subagent report is at most 15 lines. Line 1 is DONE, BLOCKED or FAILED.
- The orchestrator reruns every acceptance check before it accepts an item.
- If the spec is ambiguous or conflicts with the code, stop and ask. Never guess.
- Log harness changes in `.claude/HARNESS-CHANGELOG.md`: what, why, expected effect.

<!-- rtk-instructions v2 -->
## Command output

`rtk` (`~/.local/bin/rtk`) condenses verbose output: `rtk git diff`, `rtk vitest`,
`rtk tsc`, `rtk err <cmd>`, `rtk test <cmd>`, `rtk log <file>`.

CAUTION: run the raw command when you verify an exact value: a checksum, a signature,
a 402 header, or a test count. Never verify an acceptance check against filtered output.
<!-- /rtk-instructions -->
