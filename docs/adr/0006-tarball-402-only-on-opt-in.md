# A reviewed tarball returns 402 only with donation opt-in

npm cannot pay a 402. The seed list (`ms`, `once`, `inherits`) is in almost every lockfile, so a
hard 402 on reviewed tarballs would break `npm install` for every user who sets `registry=` in
`.npmrc`, and SPM promises "no migration". The tarball route therefore serves a reviewed tarball
free, with an `X-SPM-Tier` header, unless the request carries `X-SPM-Donate: 1`. Then it returns
402. The attestation routes keep standard x402 behaviour: reviewed content returns 402 to any
caller, so Bazaar agents can pay. SPM clients that run without `--donate` send
`X-SPM-Donate: 0` and get a free partial attestation. It withholds the reviewed entries and
always lists `INTEGRITY_MISMATCH` and `UNRESOLVABLE` entries, because SPM never charges for a
security warning.
