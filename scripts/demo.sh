#!/usr/bin/env bash
# Runs the documented demo path end-to-end and prints the Lora URL(s). The
# G5 demo gate. NETWORK defaults to testnet — the live rehearsal network
# (CLAUDE.md: "TestNet is for pre-flight rehearsal only").
#
# WARNING: this script needs a real, funded PAYER_MNEMONIC and a real
# deployed SplitRouter (SPLIT_APP_ID/SPLIT_APP_ADDRESS) in .env. It never
# invents throwaway credentials the way scripts/verify.sh does for its
# rehearsal run — a demo with a fake wallet proves nothing on stage.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NETWORK="${NETWORK:-testnet}"
echo "== SPM demo ($NETWORK) =="

# Load root .env so SPLIT_APP_ID, PAYER_MNEMONIC, SPLIT_APP_ADDRESS,
# ATTEST_SIGNING_KEY etc. are in scope.
if [ -f "$ROOT/.env" ]; then
  set -o allexport
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +o allexport
fi

# Required for every check below to run for real, not SKIP.
missing=""
for var in SPLIT_APP_ID SPLIT_APP_ADDRESS PAYER_MNEMONIC ATTEST_SIGNING_KEY; do
  if [ -z "${!var:-}" ]; then
    missing="$missing $var"
  fi
done
if [ -n "$missing" ]; then
  echo "ERROR: missing required .env value(s):$missing"
  echo "       Run bash scripts/deploy-testnet.sh first, and set ATTEST_SIGNING_KEY."
  exit 1
fi
export SPLIT_APP_ID SPLIT_APP_ADDRESS PAYER_MNEMONIC ATTEST_SIGNING_KEY

# Kill any stale proxy on the configured port before starting ours.
PORT="${PORT:-4873}"
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1

# Start proxy in background with a demo-specific DB.
export SQLITE_PATH="/tmp/spm_demo_$(date +%s).db"
export SPM_PROXY_URL="${SPM_PROXY_URL:-http://localhost:$PORT}"
pnpm --dir "$ROOT/proxy" start >"$ROOT/proxy/demo-proxy.log" 2>&1 &
PROXY_PID=$!
trap 'pkill -P "$PROXY_PID" 2>/dev/null; kill "$PROXY_PID" 2>/dev/null; fuser -k "${PORT}/tcp" 2>/dev/null; echo "Proxy stopped."' EXIT

# Wait for proxy to be ready (up to 15s); fail if our process died.
echo "Starting proxy..."
ready=0
for _ in $(seq 1 30); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "ERROR: proxy failed to start. Check proxy/demo-proxy.log"
    cat "$ROOT/proxy/demo-proxy.log" >&2
    exit 1
  fi
  if curl -sf "$SPM_PROXY_URL/api/v1/status/ping/1.0.0" >/dev/null 2>&1; then
    ready=1
    echo "Proxy ready."
    break
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "ERROR: proxy did not become ready within 15s. Check proxy/demo-proxy.log"
  cat "$ROOT/proxy/demo-proxy.log" >&2
  exit 1
fi

# tsx lives in mcp/node_modules — several e2e.mjs checks import TypeScript
# source files directly and need its loader. Required, not optional: a
# plain `node` run cannot resolve those imports, so this script fails loud
# instead of silently skipping real checks.
TSX="$ROOT/mcp/node_modules/.bin/tsx"
if [ ! -x "$TSX" ]; then
  echo "ERROR: $TSX not found. Set up dependencies with pnpm first."
  exit 1
fi

if "$TSX" "$ROOT/scripts/e2e.mjs"; then
  echo "DEMO: PASS"
  echo "Follow DEMO.md for the live walkthrough. Open the printed Lora URL(s) on stage."
  exit 0
else
  echo "DEMO: FAIL"
  exit 1
fi
