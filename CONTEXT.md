# SPM

SPM is an npm-compatible registry overlay. Unreviewed packages pass through for free.
Human-reviewed packages cost a USDC micropayment, and the revenue funds the people who review
and maintain them.

## Language

### Review status

**Tier**:
The single review level of one package version: who looked at it.
Values: `UNREVIEWED`, `AUTO_SCANNED`, `COMMUNITY_REVIEWED`, `PEER_REVIEWED`,
`MISSION_CRITICAL_SAFE`.
_Avoid_: status, audit level

**Flag**:
A fact about one package version that is independent of its tier: what is known.
A version can have many flags (`cve:<id>`, `auto_scan:clean`, `auto_scan:findings`,
`adversarial:challenged`).
_Avoid_: status value, label

**COMMUNITY_REVIEWED**:
The tier for a package version where at least one registered auditor read that exact tarball
and signed a review.
_Avoid_: REVIEWED, audited

### People

**Donor**:
A caller who opts in to pay for a reviewed resource.
_Avoid_: payer, customer, user-donor

**Free user**:
A caller who uses only the free paths: unreviewed tarballs, unreviewed attestations, and
lockfiles with no reviewed package.
_Avoid_: anonymous user

**Auditor**:
A person who reviews one exact package version and signs the review.
_Avoid_: reviewer (when it means the primary auditor), security researcher

**Ops**:
The operator of the SPM service. Ops receives the ops role share. In the MVP, ops also receives,
as income, the shares of roles that are not yet onboarded.
_Avoid_: admin (when it means the revenue role)

### Revenue

**Role share**:
The fixed percentage of each payment that goes to one role.
_Avoid_: cut, fee

**Repo pool**:
The balance that one repository accumulates from payments for its own packages. Payees claim
their role share from it.
_Avoid_: pool (without a qualifier), escrow, role pool

**Contributor**:
The author of a merged fix PR that references an audit.
_Avoid_: developer, committer
