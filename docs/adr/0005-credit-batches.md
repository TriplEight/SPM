# PaymentRouter credits in numbered batches, not per payment

`credit(batchSeq, attributedTotal, unattributedTotal, entries)` credits many settled payments
in one call. `entries` are auditor amounts grouped by `(repo, identity)`. The contract asserts
that `batchSeq` is exactly one more than the last batch, that the entries sum to exactly
`attributedTotal × 400 / 1000`, and that `attributedTotal + unattributedTotal` is not above the
unallocated balance of `payTo`. Ops gets the rest of `attributedTotal` and all of
`unattributedTotal` (inflows with no ledger attribution). We rejected one credit per
`settleTxid`: each call costs a 1,000 µALGO fee (about 11% of a $0.001 payment), and a replay
record per txid in a box locks about 0.015 ALGO of minimum balance, more than the payment itself.
The ledger maps each settle txid to its batch, so the audit trail stays per payment.
