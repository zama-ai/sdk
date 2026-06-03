#!/usr/bin/env bash
# Start anvil, deploy contracts, then keep anvil in the foreground.
# Usage: ./start-anvil.sh <port>
#
# Instances may run in parallel (Playwright boots all webServers at once), so
# the forge step is lock-serialized to avoid broadcast-cache conflicts (shared
# chain-id 31337). Playwright does not retry webServer boot, so start+deploy is
# wrapped in a retry loop (ANVIL_DEPLOY_ATTEMPTS, default 3).
set -euo pipefail

PORT="${1:?Usage: start-anvil.sh <port>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/../../contracts" && pwd)"
FORGE_FHEVM_DIR="$CONTRACTS_DIR/lib/forge-fhevm"

# Anvil default account #0
DEPLOYER_PK="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEPLOYER_ADDR="$(cast wallet address --private-key "$DEPLOYER_PK")"

LOCK_DIR="$CONTRACTS_DIR/.forge-deploy-lock"
MAX_ATTEMPTS="${ANVIL_DEPLOY_ATTEMPTS:-3}"
ANVIL_PID=
LOCK_ACQUIRED=false

cleanup() {
  release_lock
  stop_anvil
}
trap cleanup EXIT

release_lock() {
  [ "$LOCK_ACQUIRED" = true ] && rm -rf "$LOCK_DIR" 2>/dev/null || true
  LOCK_ACQUIRED=false
}

# Free the port, killing any stale process (a previous run or a half-dead anvil).
free_port() {
  if lsof -ti :"$PORT" >/dev/null 2>&1; then
    lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

stop_anvil() {
  if [ -n "$ANVIL_PID" ]; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
    ANVIL_PID=
  fi
}

# Start anvil in the background and wait until it is serving RPC requests.
start_anvil() {
  free_port

  anvil --port "$PORT" --chain-id 31337 --silent &
  ANVIL_PID=$!

  # Poll a real RPC call, not a bare TCP accept: the port can open before anvil
  # is ready to serve, and deploying against it then is a needless race.
  local n=0
  while [ $n -lt 150 ]; do
    cast chain-id --rpc-url "http://127.0.0.1:$PORT" >/dev/null 2>&1 && return 0
    sleep 0.2
    n=$((n + 1))
  done

  echo "Anvil on port $PORT failed to start" >&2
  return 1
}

# Exclusive lock for the forge step (mkdir is atomic). Times out after 120s, and
# reclaims the lock if its holder died (e.g. Playwright was killed).
acquire_lock() {
  local lock_wait=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [ -f "$LOCK_DIR/pid" ]; then
      local holder
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
      return 1
    fi
  done
  echo $$ > "$LOCK_DIR/pid"
  LOCK_ACQUIRED=true
}

# Deploy the fhevm host stack + project contracts. Returns non-zero (without
# exiting) on failure so the caller can restart anvil and retry.
deploy_contracts() {
  local attempt_num="$1"

  # fhevm host stack — independent per port, no lock needed. Skip the internal
  # forge build in CI, where artifacts are prebuilt and soldeer deps may be absent.
  local deploy_args=(--anvil-port "$PORT")
  [ -n "${CI:-}" ] && deploy_args+=(--skip-build)
  if ! "$FORGE_FHEVM_DIR/deploy-local.sh" "${deploy_args[@]}"; then
    echo "fhevm host stack deploy failed on port $PORT" >&2
    return 1
  fi

  acquire_lock || return 1

  # Clear broadcast cache — both anvils share chain-id 31337, so the second run
  # would see stale artifacts from the first and fail with "nonce too low".
  rm -rf "$CONTRACTS_DIR/broadcast"

  # Deploy project contracts. forge's batched simulation estimates gas with warm
  # storage (EIP-2929), but each broadcast tx runs cold, so the FHE-heavy wrap()
  # txs exceed the default 1.3x headroom and revert out-of-gas. --skip-simulation
  # sizes each tx from a live (cold) eth_estimateGas and --slow lets it see the
  # prior tx — accurate gas, without padding the limit via --gas-estimate-multiplier.
  local forge_args=(--broadcast --slow --skip-simulation)
  if [ "$attempt_num" -ge "$MAX_ATTEMPTS" ]; then
    # Last attempt: drop --silent so a persistent failure shows the forge trace.
    echo "Final deploy attempt — running forge verbosely to surface the failure" >&2
  else
    forge_args+=(--silent)
  fi

  local rc=0
  (cd "$CONTRACTS_DIR" && forge script script/Deploy.s.sol \
    --rpc-url "http://127.0.0.1:$PORT" \
    "${forge_args[@]}" \
    --sender "$DEPLOYER_ADDR" \
    --private-key "$DEPLOYER_PK") || rc=$?

  release_lock
  return "$rc"
}

attempt=1
while :; do
  if start_anvil && deploy_contracts "$attempt"; then
    break
  fi

  # deploy_contracts already released the lock; just tear anvil down to retry.
  stop_anvil

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Contract deploy failed after $MAX_ATTEMPTS attempt(s) on port $PORT" >&2
    exit 1
  fi
  echo "Deploy attempt $attempt/$MAX_ATTEMPTS failed on port $PORT — restarting anvil and retrying" >&2
  attempt=$((attempt + 1))
  sleep 1
done

echo "Anvil ready on port $PORT"

# Keep the process alive — Playwright will kill it on teardown.
wait "$ANVIL_PID"
