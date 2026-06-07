#!/usr/bin/env bash
# Runs the documented demo path end-to-end and prints the Lora URL. The G5 demo gate.
# NETWORK defaults to testnet (the live stage network).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
echo "== SPM demo ($NETWORK) =="

# Load root .env so SPLIT_APP_ID, PAYER_MNEMONIC, SPLIT_APP_ADDRESS etc. are in scope
if [ -f "$ROOT/.env" ]; then
  set -o allexport
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +o allexport
fi

# Check required vars for paid-install path
if [ -z "${SPLIT_APP_ID:-}" ] || [ -z "${PAYER_MNEMONIC:-}" ]; then
  echo "ERROR: SPLIT_APP_ID and PAYER_MNEMONIC must be set in .env"
  echo "       Run: bash scripts/deploy-testnet.sh first"
  exit 1
fi

# Kill any stale proxy on port 4873 before starting ours
fuser -k 4873/tcp 2>/dev/null || true
sleep 1

# Start proxy in background with a demo-specific DB
export SQLITE_PATH=/tmp/spm_demo_$(date +%s).db
pnpm --dir "$ROOT/proxy" start >"$ROOT/proxy/demo-proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null; echo "Proxy stopped."' EXIT

# Wait for proxy to be ready (up to 15s); fail if our process died
echo "Starting proxy..."
for i in $(seq 1 30); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "ERROR: proxy failed to start. Check proxy/demo-proxy.log"
    cat "$ROOT/proxy/demo-proxy.log" >&2
    exit 1
  fi
  if curl -sf http://localhost:4873/api/v1/status/ping/1.0.0 >/dev/null 2>&1; then
    echo "Proxy ready."
    break
  fi
  sleep 0.5
done

# tsx lives in mcp/node_modules so TS dynamic imports in e2e work
TSX="$ROOT/mcp/node_modules/.bin/tsx"
E2E_CMD="node"
if [ -f "$TSX" ]; then
  E2E_CMD="$TSX"
fi

if "$E2E_CMD" "$ROOT/scripts/e2e.mjs" --network "$NETWORK"; then
  echo "DEMO: PASS"
  echo "Follow DEMO.md for the live walkthrough. Open the printed Lora URL on stage."
  exit 0
else
  echo "DEMO: FAIL"
  exit 1
fi
