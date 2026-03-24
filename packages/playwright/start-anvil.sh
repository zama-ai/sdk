#!/usr/bin/env bash
# Start an anvil instance, deploy contracts, then keep anvil in the foreground.
# Usage: ./start-anvil.sh <port>
#
# Multiple instances may run in parallel (Playwright starts all webServer
# entries at once). The forge script step is serialized via a lockdir to avoid
# broadcast-cache conflicts (both anvils share chain-id 31337).
set -euo pipefail

PORT="${1:?Usage: start-anvil.sh <port>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/../../contracts" && pwd)"
FORGE_FHEVM_DIR="$CONTRACTS_DIR/lib/forge-fhevm"

# Anvil default account #0
DEPLOYER_PK="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEPLOYER_ADDR="$(cast wallet address --private-key "$DEPLOYER_PK")"

LOCK_DIR="$CONTRACTS_DIR/.forge-deploy-lock"
ANVIL_PID=
LOCK_ACQUIRED=false

cleanup() {
  [ "$LOCK_ACQUIRED" = true ] && rm -rf "$LOCK_DIR" 2>/dev/null || true
  [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Kill any stale process on the port from a previous run
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Start anvil in the background
anvil --port "$PORT" --chain-id 31337 --silent &
ANVIL_PID=$!

# Wait for anvil to accept connections
n=0
while [ $n -lt 150 ]; do
  nc -z 127.0.0.1 "$PORT" 2>/dev/null && break
  sleep 0.2
  n=$((n + 1))
done

if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
  echo "Anvil on port $PORT failed to start" >&2
  exit 1
fi

# Deploy fhevm host stack — independent per port, no lock needed.
"$FORGE_FHEVM_DIR/deploy-local.sh" --anvil-port "$PORT"

# Acquire an exclusive lock for forge script only.
# mkdir is atomic on all POSIX systems. Timeout after 120s.
# If the lock exists but the holder is dead (e.g. Playwright was killed), clean it up.
lock_wait=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  if [ -f "$LOCK_DIR/pid" ]; then
    holder=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      rm -rf "$LOCK_DIR" 2>/dev/null || true
      continue
    fi
  else
    # Lock dir exists but no pid file — stale from a hard kill. Clean up.
    rm -rf "$LOCK_DIR" 2>/dev/null || true
    continue
  fi
  sleep 0.5
  lock_wait=$((lock_wait + 1))
  if [ $lock_wait -ge 240 ]; then
    echo "Timed out waiting for forge deploy lock after 120s" >&2
    exit 1
  fi
done
echo $$ > "$LOCK_DIR/pid"
LOCK_ACQUIRED=true

# Clear broadcast cache — both anvils share chain-id 31337, so the second run
# would see stale artifacts from the first and fail with "nonce too low".
rm -rf "$CONTRACTS_DIR/broadcast"

# Deploy project contracts
(cd "$CONTRACTS_DIR" && forge script script/Deploy.s.sol \
  --rpc-url "http://127.0.0.1:$PORT" \
  --broadcast --silent \
  --sender "$DEPLOYER_ADDR" \
  --private-key "$DEPLOYER_PK")

rm -rf "$LOCK_DIR" 2>/dev/null || true
LOCK_ACQUIRED=false

echo "Anvil ready on port $PORT"

# Keep the process alive — Playwright will kill it on teardown.
wait "$ANVIL_PID"
