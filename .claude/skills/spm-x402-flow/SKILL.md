---
name: spm-x402-flow
description: >
  How SPM does the x402 402->pay->retry round-trip on Algorand with the
  @x402-avm packages. Use for the proxy gate, the MCP/CLI payer, payment
  requirements, headers, and facilitator vs direct-submit settlement.
---
# x402 on Algorand for SPM

## Packages (scoped — exact names)
@x402-avm/core, @x402-avm/avm, @x402-avm/express (Hono/Express middleware patterns),
@x402-avm/axios (client auto-handles 402). NOT "@x402/avm".

From @x402-avm/avm import: ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID ("10458941").

## Server: PaymentRequirements for a paid package
scheme: "exact"
network: ALGORAND_TESTNET_CAIP2
payTo: SPLIT_APP_ADDRESS
asset: USDC_TESTNET_ASA_ID          // "10458941"
maxAmountRequired: "1000"           // 1000 µUSDC = $0.001
maxTimeoutSeconds: 60
extra: { name: "USDC", decimals: 6, appMethod: "pay", args: [pkg, ver] }

Gate logic: status < COMMUNITY_REVIEWED -> passthrough (free). Else respond 402 with
the requirements above. Free tier must never require a wallet.

## Client (agent / CLI)
On 402, decode requirements, build an ATOMIC GROUP:
  [0] USDC AssetTransfer: payer -> SPLIT_APP_ADDRESS, amount 1000, asset 10458941
  [1] ApplicationCall: pay(pkg, ver) on SPLIT_APP_ID, with [0] as the payment arg
Sign both, base64-encode per x402, retry the GET with the X-PAYMENT header.

## Settlement (server)
Path A: HTTPFacilitatorClient({url: FACILITATOR_URL}) + registerExactAvmScheme on the
resource server (GoPlausible). Path B (FACILITATOR_URL blank): submit the signed group
with algosdk and waitForConfirmation yourself. Confirm the 5 inner transfers before 200.

Return 200 + tarball + X-AUDIT-ATTESTATION: <attest box value or txid>.

## Money rule
All amounts are integer micro-unit strings. Never floats.
