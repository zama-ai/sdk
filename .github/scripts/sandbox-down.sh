#!/usr/bin/env bash
# Network sandbox teardown: reset iptables and stop Squid proxy.
#
# All commands use `|| true` so this script is safe to run in `if: always()` contexts.
# `set -e` is intentionally omitted — teardown must run to completion even if individual commands fail.
#
# Optional env vars:
#   RUNNER_DEBUG   — set to "1" to print Squid access logs before stopping

set -uo pipefail

# ── Reset iptables ──────────────────────────────────────────────────

sudo iptables -P OUTPUT ACCEPT || true
sudo iptables -F OUTPUT || true
sudo iptables -F DOCKER-USER || true

if command -v ip6tables >/dev/null 2>&1; then
  sudo ip6tables -P OUTPUT ACCEPT || true
  sudo ip6tables -F OUTPUT || true
fi

# ── Print Squid logs (debug only) ──────────────────────────────────

if [ "${RUNNER_DEBUG:-0}" = "1" ]; then
  if docker ps -a --format '{{.Names}}' | grep -qx sandbox-proxy; then
    echo "==> Squid Logs"
    docker exec sandbox-proxy sh -lc '
      LOG=/var/log/squid/access.log
      test -f "$LOG" || { echo "No $LOG found"; exit 0; }
      tail -n 800 "$LOG" | grep -E "TCP_DENIED| CONNECT "
    ' || true
  fi
fi

# ── Stop Squid proxy ───────────────────────────────────────────────

docker rm -f sandbox-proxy 2>/dev/null || true

# Verify egress is restored — warn (don't fail) if it isn't
if ! curl -sf --max-time 5 -o /dev/null https://api.github.com 2>/dev/null; then
  echo "::warning::Egress may not be fully restored after teardown"
fi

echo "Network sandbox torn down"
