# The lockfile price is 1,000 µUSDC per reviewed package, with no discount

`POST /v1/attest/lockfile` costs 1,000 µUSDC for each reviewed entry in the lockfile, with no
cap and no bulk discount. It is free when no entry is reviewed. We keep the route, and do not
tell clients to call the single-package route N times, because one settlement per CI run is
faster and cheaper, and it avoids bursts from one wallet that the facilitator can class as
`DEV`. It also gives one signed artifact bound to the lockfile digest. The flat $0.02 price was
rejected: it gave a discount above 20 reviewed entries and a premium below, and it needed a
pro-rata remainder rule. Now each reviewed entry credits exactly 400 µUSDC to its auditor. The
client spend cap is 1,000 µUSDC × the number of entries in the lockfile it sends.
