---
name: spm-split-contract
description: >
  How to build the SPM SplitRouter AVM contract — the atomic 5-way revenue
  split. Use when writing or editing the contract, its inner transactions,
  ABI methods, box attestation, or the deploy/opt-in script.
---
# SplitRouter

ARC-4 app (Algorand TypeScript / Puya-TS). Receives a USDC AssetTransfer grouped
immediately before the app call, then fans out via inner transactions.

## Unit
$0.001 USDC, 6 decimals => UNIT = 1000 µUSDC.
Split: auditor 500, maintainer 200, adversarial 150, treasury 100, ops 50. Sum = 1000.
If you later parametrize the amount, give treasury the integer remainder.

## ABI
- setRecipients(auditor, maintainer, adversarial, treasury, ops, assetId): admin only.
  Store the 5 addresses + ASSET_ID in global state. (assetId param enables USDC or EURD.)
- pay(payment: gtxn.AssetTransferTxn, pkg: string, ver: string):
  assert payment.xferAsset == ASSET_ID
  assert payment.assetReceiver == Global.currentApplicationAddress
  assert payment.assetAmount == UNIT
  issue 5 inner AssetTransfer txns of 500/200/150/100/50 to the stored recipients
  log(concat(pkg, "@", ver, " ", payment.sender))   // proxy reads to confirm
- attest(pkg: string, ver: string, status: uint64): assert sender is an allowed auditor;
  write box "attest:"+pkg+"@"+ver = pack(sender, Txn.txId, status, Global.latestTimestamp).

## Opt-ins (critical)
The app account AND all 5 recipient accounts must opt into ASSET_ID before any pay().
Do this in contracts/scripts/setup.ts, automated, before the demo. For EURD bonus,
opt the same accounts into the EURD ASA too and call setRecipients with that assetId.

## Tests
- split-sum: inner amounts sum to UNIT.
- reject wrong asset / wrong amount / wrong receiver.
Build LocalNet first; only then TestNet. Print APP_ID + APP_ADDRESS.
