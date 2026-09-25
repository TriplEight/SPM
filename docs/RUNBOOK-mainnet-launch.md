# Runbook — MainNet launch and qualification

WARNING: this runbook describes SPEC v4 (SplitRouter, `distribute()`, `$0.02` flat lockfile
price). SPEC v6 replaces that design. Do not follow it on MainNet. `docs/TASK.md` item D1
rewrites it from the v6 code. Until then, use `SPEC.md` §10, §13, §14 and §17.

**Audience:** the next session, starting after the contract artifacts are
regenerated, MainNet is provisioned and deployed, and third-party donor
accounts exist.

Everything buildable without a chain, a domain or a human reviewer is already
done and merged. This runbook covers what remains.

---

## 0. Verify the preconditions. Do not trust them.

Each of these was done outside this repository, so check each on-chain or on
disk before building on it.

```bash
# 0.1 The artifacts describe THIS contract, not the old one.
node -e "const j=require('./contracts/smart_contracts/artifacts/split_router/SplitRouter.arc56.json'); console.log(j.methods.map(m=>m.name).join(' '))"
```
Expect exactly: `setPayTo setRecipients optInToAsset distribute attest releaseAuthority
setAttestationKey`. Order may differ; the set must not.
WARNING: if `pay` appears, the build did not run. Stop and run
`docs/RUNBOOK-contract-build.md` first. Everything below assumes the new ABI.
WARNING: if `setPayTo` is missing, the build predates the variant-B fix, and
`releaseAuthority` cannot succeed. See 1.3.

```bash
# 0.2 The app account is opted into MainNet USDC (31566704).
curl -s "https://mainnet-api.algonode.cloud/v2/accounts/<SPLIT_APP_ADDRESS>" \
  | jq '.assets[] | select(."asset-id"==31566704)'
```
An empty result means the opt-in is missing, and every payment will fail.

```bash
# 0.3 All five recipients are opted in. Repeat 0.2 for each address.
# 0.4 setRecipients() ran, and the stored addresses are the intended ones.
# 0.5 Each third-party donor is funded AND opted into 31566704.
```
CAUTION: a donor who holds USDC but is not opted in cannot donate. A donor
who is opted in but holds no ALGO cannot sign. Check both.

---

## 1. The three traps that cost the most if missed

### 1.1 `distribute()` will not run on a single small payment

`distribute()` asserts a floor of **100,000 µUSDC ($0.10)**. It is the
fee-drain guard: without it, anyone could loop the call and burn the app's
ALGO on inner-transaction fees.

| Route | Price | Payments needed to reach $0.10 |
|---|---|---|
| tarball | $0.001 | 100 |
| single attest | $0.001 | 100 |
| lockfile | $0.02 | **5** |

The qualification checklist requires `distribute()` executed on MainNet with
five inner transfers visible on Lora. **One qualifying payment of $0.001 will
not get you there.** The call reverts with `below minimum distribution`.

Options, cheapest first:
1. Make **five lockfile calls** ($0.10 total). Legitimate traffic, and it is
   the route you want volume on anyway.
2. Send USDC directly to `payTo` to top the balance up. The reconciliation job
   ledgers a direct inflow as `unassigned`, which is correct and honest.

WARNING: do not lower `MIN_DISTRIBUTE` to make a demo work. Below roughly
$0.10 a call can cost more in fees than it moves, which is the exact hole the
guard closes.

Also fund the app with about 1 ALGO for minimum balance and headroom, and pool
at least 6,000 µALGO on the `distribute()` call itself, because the inner
transfers are sent with fee 0.

### 1.2 Attribution is written at settlement and is not retroactive

The `x402-global-challenge` tag must be present in `extra` **before the first
real payment**. Payments settled before it is live are attributed to `direct`
or `dev` and never move to the challenge bucket.

Confirm the tag is live before anyone pays:

```bash
curl -si "https://<domain>/v1/attest?name=ms&version=2.1.3" | grep -i "PAYMENT-REQUIRED"
```
Decode that header and confirm `extra.tag`, `extra.asset` = `31566704`, and
`extra.feePayer`.
WARNING: the 402 **body is `{}`**. The requirements are in the header. A check
that greps the body will report a false negative.

`scripts/check-402.mjs <url>` decodes the header and prints one PASS/FAIL line
per field: `extra.tag`, `extra.asset`, `network`, and `extra.feePayer` (the
last resolved live from the facilitator's `getSupported()`, never hardcoded).

### 1.3 `payTo` is the leaderboard key

One address for the whole competition. Changing it after the first settled
payment restarts the entry at zero.

Two variants ship. Decide before the first call, because `payTo` is write-once.

- **Variant A, the default.** `payTo` is the application address. Call
  `setRecipients` and skip `setPayTo`. `releaseAuthority` is unusable here, by
  design: an application account cannot be rekeyed.
- **Variant B, the rekey path.** `payTo` is a plain account rekeyed to the
  application. Call `setPayTo(<address>)` **before** `setRecipients`.
  `releaseAuthority` later rekeys that account away.

`setPayTo` corrects `payTo` only while it holds zero USDC. Once revenue
lands it asserts `payTo already holds revenue`, and the address stays fixed.
WARNING: a `setRecipients` call made first, without a prior `setPayTo`,
locks in variant A once a payment settles.

For variant B the ordering is irreversible: **opt into USDC first, then rekey.**
A rekeyed account cannot sign its own opt-in, and the application cannot opt it
in beforehand.

---

## 2. Configure and deploy the server

```bash
cp .env.example .env    # then fill in
```
Set `NETWORK=mainnet`, `SPLIT_APP_ID`, `SPLIT_APP_ADDRESS`, `ATTEST_SIGNING_KEY`,
`SPM_ISSUER_URL` (the real domain), `FACILITATOR_URL`, `ALGOD_SERVER`.

WARNING: the bootstrap block at the bottom of `.env.example` holds recipient
mnemonics, needed once locally because an ASA opt-in must be signed by the
account itself. **Delete that block from the server's `.env`.** The running
server never needs a recipient key: it only receives USDC, and `distribute()`
is permissionless.

The attestation key is hot on the server by necessity. Keep it separate from
payTo, admin and pool keys. It is unfunded and never used on-chain.

Then deploy behind HTTPS on one root domain, and add `og:site_name`,
`og:title`, `og:description` and `og:image` at the domain root for the Bazaar
merchant card.

```bash
bash scripts/verify.sh   # the e2e step must now PASS, not SKIP
```
CAUTION: in the build sandbox the e2e step reports SKIP because the facilitator
is unreachable. On a networked host it must turn into a real PASS. A SKIP there
means the server cannot reach the facilitator, and no payment will settle.

The server refuses to boot when the facilitator does not advertise MainNet
`exact`. That is deliberate. A boot failure here is a configuration problem,
not a bug.

---

## 3. Seed real reviews

WARNING: a seeded `COMMUNITY_REVIEWED` record asserts that a human read that
exact tarball. Section 7 of the spec forbids fabricating one, and a paid
attestation repeating a fabricated record is the worst failure this product
has.

**A review record without a stored `integrity` resolves to `UNREVIEWED`.** This
is enforced, not advisory. Seeding a review without the tarball hash produces
nothing, by design: if SPM cannot say which tarball was read, it must not sell
a claim about one.

For each package, store name, version, tier, reviewer, review scope, the
MainNet attest txid, and the tarball `integrity` from the npm registry.

Target 15 to 30 small, ubiquitous packages that a human can genuinely review.
Before reviewing, measure the hit rate: run the candidate list against 20 real
`package-lock.json` files and record the median reviewed count in `NOTES.md`.
That median sets the lockfile price. If it lands below 5, the seed list is
wrong rather than the price.

### Measure the hit rate

Put one candidate package name per line in a text file. Use `#` for
comments. Collect 20 real `package-lock.json` files, or point the script at
a directory that contains them (it finds every `package-lock.json` inside,
recursively, and skips `node_modules`).

Run:

```bash
node scripts/hit-rate.mjs candidates.txt <lockfiles-dir>
```

The script prints a per-file hit count, the median, min, max, and how many
lockfiles contain each candidate. It prints a WARNING when you give it
fewer than 20 lockfiles, and a VERDICT line: `median >= 5` or `seed list
too weak (median < 5)`.

Record the median in `NOTES.md` before you seed any review.

---

## 4. Qualify

1. One real payment from a real wallet, not from localhost and not scripted.
2. Confirm the resource appears in `/discovery/resources`.
3. Confirm the merchant appears under `src=x402-global-challenge`.
4. Reach the $0.10 floor, then call `distribute()`.
5. Record the settle txid and the Lora link in `NOTES.md`.

```bash
for s in x402-global-challenge bazaar direct dev; do
  curl -s "https://facilitator.goplausible.xyz/data/leaderboards?cat=merchants&limit=200&range=all&env=mainnet&src=$s" \
  | jq --arg a "$PAY_TO" '.items[] | select(.address==$a) | {rank,settles,volume}'; done
```
If volume lands under `dev` or `direct`, attribution is broken. Fix it before
generating more traffic, because it does not migrate.

CAUTION: the facilitator classifies localhost traffic, cron pings, retry storms
and self-payment loops as `DEV`. Those settle for real and never count. Use
event-triggered CI only, one wallet per adopting team, and no retry beyond the
protocol's single retry.

---

## 5. Third-party donors

This is the item the submission form asks about, and the only one whose
latency is other people's.

Each donor needs the `spm-attest` Action merged, a MainNet address, a USDC
opt-in, and a few dollars of Algorand-native USDC. Acquiring that USDC is the
bottleneck: most people hold none on Algorand, and an exchange withdrawal takes
days.

Confirm each shows up as a distinct address under `cat=payers`. Team wallets
are labelled as such in `NOTES.md` and in the submission.

The Action **fails open** by design: a facilitator outage, a 5xx or a missing
wallet secret logs a warning and exits 0. Do not change that. An attestation
step that reddens someone else's CI is removed from their repository the first
time it does, and the volume goes with it.

---

## 6. The nightly job

The proxy process schedules the nightly job itself: reconcile, back up, then
credit (SPEC.md §13.2), daily at 03:17 UTC, plus a catch-up run at start when
the last successful run is more than 24 hours old or none exists (ADR 0009).
Nothing to install. A Portainer redeploy of the proxy container carries the
schedule with it.

`SPM_NIGHTLY=off` disables the schedule (`.env.example`). Any other value
refuses to boot.

Check `GET /api/v1/health` for the last run and the last success. It answers
200 when the last success is at most 26 hours old, else 503.

Run one pass by hand, for example right after a deploy:
```bash
docker compose run --rm proxy pnpm nightly
```
A successful run logs `spm-nightly: credited batch N, txid ...` (or, with no
`PAYMENT_ROUTER_APP_ID` yet, `spm-nightly: credit skipped — ...`) and exits
0. This manual entry point (`nightly-main.ts`) takes the same SQLite lease as
the in-process scheduler, so the two never run at once.

---

## 7. Known open items

- **Legal.** SPM will hold funds owed to third parties. For a German operator
  that may touch payment-services regulation. Get advice before paying anyone
  outside the team. It is not judged in the competition; it is personal
  exposure.

---

## 8. State at handoff

| Check | Result |
|---|---|
| proxy tests | 306 |
| cli tests | 16 |
| contracts tests | 16 |
| mcp tests | 8 |
| Action tests | 9 |
| `pnpm typecheck` | passes |
| `scripts/guard.sh` | clean |
| `pnpm exec biome ci .` | exit 0, zero warnings |
| `bash scripts/verify.sh` | exit 0, e2e SKIP pending network |

`SPEC.md` is the authoritative spec, corrected against what implementation
measured.
