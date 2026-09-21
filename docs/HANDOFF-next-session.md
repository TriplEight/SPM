# Handoff — the session with Docker, AlgoKit and MainNet

Everything buildable without a chain, a domain or a human reviewer is done and
pushed on `claude/spm-spec-orchestration-dlhhe2`. 35 commits.

This document is the order of work. Do not reorder step 1.

---

## 0. What you are walking into

| Check | Result |
|---|---|
| proxy tests | 306 |
| contracts tests | 16 |
| mcp tests | 8 |
| cli tests | 16 |
| Action tests | 9 |
| `pnpm typecheck` | passes |
| `bash scripts/verify.sh` | `VERIFY: PASS`, e2e SKIP |

The e2e SKIP is honest: the facilitator is unreachable from the build sandbox
and the proxy refuses to boot without it. On a networked host it must become a
real PASS.

Three code reviews found 25 defects after implementation. All are fixed except
the one below. `STATUS.md` records them.

---

## 1. Regenerate the contract artifacts. Nothing else first.

**This is the only blocker that no previous session could clear.**

`contracts/smart_contracts/artifacts/split_router/` still describes the old
contract. Confirm it yourself:

```bash
node -e "const j=require('./contracts/smart_contracts/artifacts/split_router/SplitRouter.arc56.json'); console.log(j.methods.map(m=>m.name).join(' '))"
```

Today this prints `setRecipients optInToAsset attest pay`. It has the deleted
`pay` and none of the new methods.

Follow `docs/RUNBOOK-contract-build.md`. Afterwards the same command must print
exactly these seven:

```
setPayTo setRecipients optInToAsset distribute attest releaseAuthority setAttestationKey
```

WARNING: `optInToAsset` changed behaviour without changing its signature. A
matching method list does not prove a fresh build of it. Confirm the TEAL came
from the current source.

CAUTION: the contract tests run in JavaScript under
`algorand-typescript-testing`. 16 passing tests do not prove the contract
compiles under Puya. Step 1 is the first time anything proves that.

`scripts/e2e.mjs` now fails with this reason instead of a `TypeError`, so a
stale build is obvious rather than confusing.

---

## 2. Decide the payTo variant before any call

`payTo` is the competition leaderboard key. One address, one root domain, for
the whole competition.

- **Variant A, the default.** `payTo` is the application address. Call
  `setRecipients` and never call `setPayTo`. `releaseAuthority` is unusable
  here by design: an application account cannot be rekeyed.
- **Variant B, the rekey path.** `payTo` is a plain account rekeyed to the
  application. Call `setPayTo(<address>)` **before** `setRecipients`.

`setPayTo` is admin-only and changeable only while `payTo` holds no USDC. Once
any revenue arrives it is fixed, and the rejection reads
`payTo already holds revenue`.

WARNING: for variant B the ordering is irreversible. **Opt into USDC first,
then rekey.** A rekeyed account cannot sign its own opt-in.

`optInToAsset` now opts in `payTo`, not the application address. Under variant
B the old behaviour would have failed every payment.

---

## 3. Deploy and configure

`cp .env.example .env`, then fill it in. `NETWORK=mainnet`.

WARNING: the bootstrap block at the bottom of `.env.example` holds recipient
mnemonics, needed once locally because an ASA opt-in must be signed by the
account itself. **Delete that block from the server's `.env`.** The running
server never needs a recipient key.

The proxy refuses to boot when `PAY_TO` is missing or fails checksum
validation, and when the facilitator does not advertise MainNet `exact`. Both
exit non-zero before the port binds. A boot failure there is configuration,
not a bug.

Then `bash scripts/verify.sh`. The e2e step must now PASS, not SKIP.

---

## 4. Confirm attribution before anyone pays

Attribution is written at settlement and is **not retroactive**. The
`x402-global-challenge` tag must be live before the first real payment, or that
revenue is attributed to `direct` or `dev` and never moves.

```bash
curl -si "https://<domain>/v1/attest?name=ms&version=2.1.3" | grep -i "PAYMENT-REQUIRED"
```

Decode the header and confirm `extra.tag`, `extra.asset` = `31566704`, and
`extra.feePayer`.

WARNING: the 402 **body is `{}`**. The requirements are in the header. A check
that greps the body reports a false negative.

---

## 5. Seed real reviews

WARNING: a seeded `COMMUNITY_REVIEWED` record asserts a human read that exact
tarball. A fabricated record is a fabricated security claim.

A review record without a stored `integrity` resolves to `UNREVIEWED`. This is
enforced. So is the digest shape: the integrity must be `sha512-` whose base64
decodes to exactly 64 bytes, or the route stays free.

Lockfile integrity is compared on the parsed sha512 digest, so npm's
multi-hash SSRI values match correctly.

---

## 6. Reach the distribute floor

`distribute()` asserts a floor of **100,000 µUSDC ($0.10)**, and asserts the
caller pools at least 6,000 µALGO of fees.

| Route | Price | Payments to reach $0.10 |
|---|---|---|
| tarball | $0.001 | 100 |
| single attest | $0.001 | 100 |
| lockfile | $0.02 | **5** |

Qualification needs `distribute()` executed on MainNet with five inner
transfers visible on Lora. **One $0.001 payment will not get you there.**

WARNING: do not lower `MIN_DISTRIBUTE` to make a demo work. Below roughly $0.10
a call can cost more in fees than it moves, which is the hole the guard closes.

---

## 7. Demo and payers

`scripts/demo.sh` resolves `NETWORK` once, before the banner, so the announced
network is the one used. An explicit `NETWORK` in your shell wins over `.env`.
A MainNet run warns and requires typing `yes`, or `SPM_DEMO_CONFIRM_MAINNET=yes`
for non-interactive use.

The `spm-attest` Action **fails open** and no longer sends any wallet
credential. CAUTION: this narrows spec §9 C3, where the Action both posted and
paid. Third-party paid volume now comes from the CLI or the MCP server.

---

## 8. Known open items

- **The reconciliation job has no scheduler.** `proxy/src/claims/reconcile.ts`
  is implemented and tested against an injectable indexer client, but nothing
  runs it. Its double-ledger guard is also one-directional: a reconcile pass
  racing the settle-to-write window could count one inflow twice. Wire it
  before relying on unmatched-inflow ledgering.
- **Payouts are manual.** `scripts/payout.ts` is dry-run by default and takes a
  key-file argument. Check every claim by hand.
- **A verified claim cannot be re-opened through the API.** That is deliberate,
  and the operator path is in `docs/RUNBOOK-mainnet-launch.md`. It moves a
  payout address, so treat it as a payout decision.
- **Two facilitator checks disagree on `x402Version`.** Both fail before the
  port binds, so behaviour is correct, but the error text misleads.
- **Legal.** SPM will hold funds owed to third parties. For a German operator
  that may touch payment-services regulation. Get advice before paying anyone
  outside the team.

---

## 9. What no session can close for you

P0 payer recruitment, MainNet provisioning, public hosting, the first real
payment, the human package reviews, the §4.2 hit-rate measurement, and the
D-phase submissions.
