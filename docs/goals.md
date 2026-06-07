# /goal conditions for SPM (Claude Code v2.1.139+)

How to use: enable auto mode (so each turn runs unattended), trust the workspace, then
paste ONE condition with `/goal <condition>`. The evaluator only sees what's in the
transcript, so each condition names a command whose output proves it. Each ends with a
turn bound. Run the right subagent first (it scopes files + skills).

Loop on LocalNet. Do not point a goal loop at TestNet.

## G1 — SplitRouter (algorand-contract-engineer)
/goal `npm -w contracts test` exits 0 with the split-sum, reject-wrong-asset,
reject-wrong-amount, reject-wrong-receiver, and attest-auth tests all passing on LocalNet;
inner amounts are exactly 500/200/150/100/50 µUSDC; do not modify proxy/ mcp/ cli/;
stop after 25 turns.

## G2 — Proxy + x402 gate (x402-proxy-engineer)
/goal `npm -w proxy test` exits 0 with free-passthrough, paid-402, status-API, and
auto-reset tests passing; the 402 uses scheme "exact", asset "10458941", and amount
"1000"; the free tier never returns 402; do not modify contracts/; stop after 25 turns.

## G3 — MCP hero path (mcp-payer-engineer)
/goal `npm -w mcp test` exits 0 proving check_audit_status needs no payment and
install_audited_package builds a correct atomic group [USDC axfer->app]+[appcall pay];
do not change the split or the contract ABI; stop after 20 turns.

## G4 — Full system on LocalNet (integration-tester)
/goal `bash scripts/verify.sh` exits 0 and its output shows every check PASS, including
the LocalNet E2E asserting 5 inner transfers 500/200/150/100/50 to the 5 recipients;
do not weaken any assertion to make it pass; stop after 30 turns.

## G5 — Tested demo on TestNet (integration-tester)
/goal `NETWORK=testnet bash scripts/demo.sh` exits 0, prints `DEMO: PASS`, and prints a
Lora URL for the settlement group showing the 5 inner transfers; the free-install step
completes with no payment; do not mock the chain; stop after 20 turns.

## Tips
- If a goal stalls, run `/goal` (no arg) to read the evaluator's last reason, fix scope.
- Keep conditions to one measurable end state + the check command + constraints + bound.
