# SPM — Project Memory (Claude Code)

@AGENTS.md

## What we are building (Global x402 Challenge, MainNet)
SPM is an npm-compatible **registry overlay**. Unreviewed packages pass through to npm
for **free**. Human-reviewed packages return **HTTP 402**. The caller pays a USDC
micropayment on **Algorand MainNet** through the mandatory GoPlausible facilitator.
Revenue splits **50/20/15/10/5** among auditor / maintainer / adversarial-reviewer /
treasury / ops. A version bump resets review status to `UNREVIEWED`.

The volume driver is `POST /v1/attest/lockfile`. It returns a signed attestation for a
whole `package-lock.json`. The tarball route is the differentiator, not the volume path.

**Authoritative spec: `SPEC-v3.md`.** `SPEC.md` is the superseded 12h hackathon spec.
The `docs/` directory still describes the hackathon MVP. Do not design from it.

## HARD CONSTRAINTS — do not violate
- TypeScript everywhere. pnpm only. Never npm or yarn.
- **MainNet is the target.** TestNet is for pre-flight rehearsal only.
- Money is always integer micro-units. **Never use floats for amounts.**
- Out of scope, do NOT build: GPG identity, ARC-19 NFTs, Postgres/Redis, reputation
  scoring, peer review / cross-signing, adversarial-review UX, governance/DAO, CodeQL
  auto-scan, Dependabot/Renovate, PyPI/crates.io, Stripe pre-funding, subscriptions,
  EURD/Quantoz, direct-submit settlement fallback, `MISSION_CRITICAL_SAFE` and
  `CVE_KNOWN` tiers, automated maintainer notifications, on-chain claimable balances,
  automated payouts, L2 online verification, dynamic pricing.
- When unsure whether something is in scope, ask the `scope-sentinel` subagent.

## INVARIANTS — every change must preserve these
1. **`payTo` is fixed and is the leaderboard key.** One MainNet address for the whole
   competition, one root domain. Changing it restarts the competition entry at zero.
2. **Never split per-payment.** The facilitator accepts only a plain USDC asset-transfer
   to `payTo`. USDC accrues there. `distribute()` fans it out later, permissionlessly.
   Say "distributes atomically and permissionlessly". Never say "in the same transaction".
3. **`extra.asset` is always explicit** on every paid route. An omitted asset may resolve
   to ALGO instead of USDC.
4. **Unreviewed never returns 402.** This holds for the tarball route, the single-attest
   route, and a zero-coverage lockfile alike.
5. **Seeded reviews are real reviews.** A `COMMUNITY_REVIEWED` record means a human read
   that exact tarball. A fabricated review record is a fabricated security claim.
6. **The facilitator is mandatory.** No local facilitator. No direct chain submission.
   The old `proxy/src/settle.ts` was an authentication bypass. It is deleted, not fixed.

## Canonical facts (verified — use these literally)
- Packages are scoped **`@x402-avm/*`**: core, avm, hono, fetch, extensions. All pinned
  to the same version, currently **2.6.1**. NOT `@x402/*`.
- `ALGORAND_MAINNET_CAIP2 = algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`
- MainNet USDC ASA id = **31566704**. TestNet = **10458941**. Both 6 decimals.
- x402 scheme = `"exact"`. Middleware `price` is a USD string. On-chain amounts are
  integer micro-unit strings. Every price is a multiple of **1,000 microUSDC**.
- Prices: lockfile attest **$0.02** (20,000), lockfile with zero reviewed packages
  **free**, single attest **$0.001** (1,000), reviewed tarball **$0.001** (1,000).
- `extra = { asset, feePayer, tag: "x402-global-challenge" }` on every paid route.
  Read `feePayer` from the facilitator's `getSupported()` at boot. Never hardcode it.
- CAUTION: the facilitator client method is `getSupported()`, not `supported()`.
- Attribution is written at settlement time and is **not retroactive**. The tag must be
  present before the first real payment.
- Facilitator: `https://facilitator.goplausible.xyz`.
- Split per 1,000 microUSDC: 500/200/150/100/50.
- `MIN_DISTRIBUTE = 100_000` microUSDC. `distribute()` asserts the divisible portion
  meets it, and asserts the caller pools at least 6,000 microALGO of fees.
- Review tier name stays **`COMMUNITY_REVIEWED`**. It is immutable once anchored on
  MainNet. The `reviewer` field makes single-reviewer status explicit.
- Attestations are **DSSE + in-toto Statement v1**, ed25519, signed by a dedicated
  unfunded service key. **Never sign with `algosdk.signBytes`** — it prepends `MX` and
  breaks standard DSSE verifiers.
- Scoped package names contain `/`. Single-package attestation uses **query params**:
  `GET /v1/attest?name=@babel/core&version=7.25.2`. The tarball route parses npm's path
  layout explicitly.
- Verified in the installed middleware: a failed settlement discards the handler body,
  and a handler status of 400 or higher skips settlement. No buffering wrapper is needed.

## Repo map
- `contracts/` AlgoKit TS — `SplitRouter`: `setRecipients`, `optInToAsset`, `attest`,
  `distribute`, `releaseAuthority`, `setAttestationKey`.
- `proxy/`     Hono overlay: npm passthrough, SQLite status store, x402 routes,
  attestation signing, claims ledger.
- `mcp/`       MCP server: `check_audit_status`, `install_audited_package`.
- `cli/`       `spm` wrapper, including `spm verify` offline verification.
- `.github/actions/spm-attest/` CI Action. **Fails open** — never redden a user's CI.

## Conventions
- Pin every dependency exactly: `pnpm add --save-exact <pkg>@<version>`.
- After finishing a unit of work, append a dated entry to `NOTES.md` (use /handoff).
- Prefer the relevant SPM skill and the Algorand DevRel skills before writing code.
- Do not attribute authorship to Claude or any AI in code, comments, docs, or commits.

## Verification
- `pnpm typecheck` must exit 0.
- `pnpm -C proxy test`, `pnpm -C contracts test`, `pnpm -C mcp test` must all pass.
- `bash scripts/verify.sh` exits 0 and prints every check `PASS`.
- CAUTION: contract tests run on `@algorandfoundation/algorand-typescript-testing`, in
  JavaScript. They do not prove the contract compiles under Puya. A human runs
  `algokit project run build` to regenerate TEAL and the typed client.
- Never weaken an assertion to make a check pass.

## Dependency Security (non-negotiable)

**Use pnpm everywhere.** Never use npm or yarn to install packages in this project.

```bash
pnpm install
pnpm add --save-exact <package>@<version>
pnpm add --save-exact --save-dev <package>@<version>
pnpm audit --audit-level=moderate

# One-time workspace config (run once per machine)
pnpm config set save-exact true
pnpm config set ignore-scripts true        # block postinstall scripts
pnpm config set minimumReleaseAge 1440     # 24-hour publish-delay gate
```

**Before adding any dependency:**
1. Check weekly downloads, last publish date, and maintainer count on npmjs.com.
2. Review its `dependencies` and `peerDependencies`. Each one is attack surface.
3. Prefer a package already used in this repo.
4. Never add a dep with postinstall scripts unless you vouch for every line.
5. Run `pnpm audit --audit-level=moderate` after adding. Fix or justify every finding.

**Secrets:**
- `.env` is gitignored. Never commit it.
- WARNING: pool-account mnemonics are **cold**. They never live on the server or in
  `.env`. A local script signs payouts.
- The attestation signing key is hot on the server by necessity. It is unfunded and
  never used on-chain. Keep it separate from the payTo, admin, and pool keys.
- Never log or hard-code a mnemonic or a private key.

## Skills available
- spm-split-contract — SplitRouter math and inner-transaction patterns.
- spm-x402-flow      — 402 round-trip with @x402-avm and the correct identifiers.
- spm-audit-status   — status tiers, auto-reset rule, SQLite schema, /api contract.
- spm-testing        — test stack, fixtures, harness.
- (Algorand DevRel skills in .claude/skills/ — AVM, x402, and AlgoKit knowledge.)

<!-- rtk-instructions v2 -->
## Command output — use `rtk` for verbose commands

`rtk` is installed at `~/.local/bin/rtk`. It condenses command output, keeping
every signal and dropping costly noise. No automatic hook is installed, so a
command is condensed only when you run it through `rtk`.

Prefix a command with `rtk` when its output is large:
- `rtk git diff` — measured 58% smaller on this repo. Use it for every diff review.
- `rtk log <file>` — deduplicates repeated log lines.
- `rtk test <cmd>` / `rtk err <cmd>` — shows only failures or only errors.
- `rtk tsc`, `rtk vitest`, `rtk pnpm` — grouped compiler and test output.
- `rtk json`, `rtk curl` — compact JSON.

Treat condensed output as the complete result. Batch related commands into one
call to avoid extra turns. Truncated results state their recovery path in their
own output. Re-run a command as `rtk proxy <cmd>` only when its result is
unusable: empty when output was clearly expected, contradicting its exit code,
or garbled.

CAUTION: run a command raw, without `rtk`, when you are verifying an exact
value: a checksum, a signature, a 402 response body, or a test assertion count.
Never verify an acceptance check against filtered output.
<!-- /rtk-instructions -->