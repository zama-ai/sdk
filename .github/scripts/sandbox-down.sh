#!/usr/bin/env bash
# Tear down the network sandbox. Runs under `if: always()` — must never fail the job.
# Intentionally omits `set -e` so every cleanup step runs regardless of earlier failures.

# ── Reset iptables ───────────────────────────────────────────────────
# Reset before any token revocation so revocation doesn't depend on Squid.
sudo iptables -P OUTPUT ACCEPT 2>/dev/null || true
sudo iptables -F OUTPUT 2>/dev/null || true
sudo iptables -F DOCKER-USER 2>/dev/null || true

if command -v ip6tables >/dev/null 2>&1; then
  sudo ip6tables -P OUTPUT ACCEPT 2>/dev/null || true
  sudo ip6tables -F OUTPUT 2>/dev/null || true
fi

# Verify egress is restored
if ! curl -sf --max-time 5 -o /dev/null https://api.github.com 2>/dev/null; then
  echo "::warning::Egress may not be fully restored after iptables reset"
fi

# ── Print Squid logs (debug mode only) ───────────────────────────────
if [ "${RUNNER_DEBUG:-0}" = "1" ]; then
  if docker ps -a --format '{{.Names}}' | grep -qx sandbox-proxy 2>/dev/null; then
    echo "==> Squid Access Logs"
    docker exec sandbox-proxy sh -lc '
      LOG=/var/log/squid/access.log
      test -f "$LOG" || { echo "No access log found"; exit 0; }
      tail -n 800 "$LOG" | grep -E "TCP_DENIED| CONNECT " || echo "(no denied/connect entries)"
    ' 2>/dev/null || echo "(could not read logs)"
  fi
fi

# ── Stop Squid container ─────────────────────────────────────────────
docker rm -f sandbox-proxy 2>/dev/null || true

echo "Network sandbox torn down."
