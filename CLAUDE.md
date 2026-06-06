# SPM — Project Memory (Claude Code)

@AGENTS.md
@docs/architecture.md

## What we are building (12h hackathon MVP)
An npm-compatible **registry overlay** where **human-audited** packages cost a
**~$0.001 USDC x402 micropayment per download on Algorand**, split on-chain
50/20/15/10/5 among auditor/maintainer/adversarial-reviewer/treasury/ops via
one **atomic group transaction**. Unreviewed packages are free.
**Primary track: Agentic Commerce.** The hero path is an MCP server an AI agent
calls and pays for autonomously.

## HARD CONSTRAINTS — do not violate
- 2 devs, ~12h, Algorand **TestNet only**, **TypeScript everywhere**.
- The demo MUST show: agent → 402 → autonomous USDC payment → 5 inner transfers
  visible on Lora → tarball installs.
- **Out of scope (do NOT build):** GPG keys, ARC-19 NFTs, Postgres/Redis (use
  SQLite), reputation scoring, adversarial-review UX, governance/DAO, CodeQL
  auto-scan, Dependabot/Renovate, multi-language, Stripe pre-funding.
- Do NOT add tracks beyond Agentic Commerce (+ optional Quantoz EURD bonus).
- When unsure whether something is in scope, ask the `scope-sentinel` subagent.

## Canonical facts (verified — use these literally)
- x402 packages are scoped **`@x402-avm/*`** (core, avm, express, axios,
  extensions). NOT `@x402/avm`.
- Network ids are CAIP-2: import `ALGORAND_TESTNET_CAIP2` from `@x402-avm/avm`.
- TestNet USDC ASA id = **10458941** (`USDC_TESTNET_ASA_ID`), 6 decimals.
- x402 scheme = `"exact"`. Amounts are micro-units strings. $0.001 = "1000".
- Split of 1000 µUSDC = 500/200/150/100/50 (sums to 1000, no remainder).
- Contract = Algorand TypeScript (Puya-TS) via AlgoKit; LocalNet then TestNet.

## Repo map
- `contracts/` AlgoKit TS — `SplitRouter` (pay/attest/setRecipients) + scripts.
- `proxy/`     Hono overlay: npm passthrough, SQLite status store, x402 gate.
- `mcp/`       MCP server: `check_audit_status`, `install_audited_package`.
- `cli/`       `spm` wrapper (secondary human path).

## Conventions
- Money is always integer micro-units. Never use floats for amounts.
- Every payment-path change must keep the free tier free (status < COMMUNITY_REVIEWED).
- After finishing a unit of work, append a dated entry to `NOTES.md` (use /handoff).
- Prefer the relevant SPM skill (spm-split-contract / spm-x402-flow /
  spm-audit-status) and the Algorand DevRel skills before writing AVM/x402 code.
- Pin dep versions on install; avoid API drift.

## Dependency Security (non-negotiable)

**Use pnpm everywhere.** Never use npm or yarn to install packages in this project.

```bash
# Install
pnpm install

# Add a dep — always pin exact, never ^ or ~
pnpm add --save-exact <package>@<version>
pnpm add --save-exact --save-dev <package>@<version>

# Audit before every install of a new dep
pnpm audit --audit-level=moderate

# One-time workspace config (run once per machine)
pnpm config set save-exact true
pnpm config set ignore-scripts true        # block postinstall scripts
pnpm config set minimumReleaseAge 1440     # 24-hour publish-delay gate
```

**Before adding any dependency:**
1. Check it on [npmjs.com](https://npmjs.com): weekly downloads, last publish date, # of maintainers.
2. Review its own `dependencies` and `peerDependencies` — each one is additional attack surface.
3. Prefer packages already used in this repo over introducing new ones.
4. Never add a dep that has postinstall scripts unless you can read and vouch for every line.
5. Run `pnpm audit --audit-level=moderate` after adding; fix or justify any findings.

**Peer-dependency hygiene:**
- Explicitly install peer deps required by x402-avm and algokit-utils at the pinned version used by the library, not a newer one. Mismatched peers cause subtle runtime bugs.
- After `pnpm install`, check `pnpm why <package>` to see who pulls in a dep transitively.

**Secrets:**
- `.env` files are gitignored — never commit them.
- Mnemonics and private keys live only in `.env`; never log or hard-code them.
- `PAYER_MNEMONIC` in the MCP server is demo-only: a fresh TestNet account, zero real value.

## Skills available
- spm-split-contract — SplitRouter math + atomic inner-txn pattern.
- spm-x402-flow      — 402 round-trip with @x402-avm + correct ids.
- spm-audit-status   — status tiers, auto-reset rule, SQLite schema, /api contract.
- (Algorand DevRel skills, copied into .claude/skills/ — AVM/x402/AlgoKit knowledge.)
