#!/usr/bin/env bash
# Network sandbox setup: Squid proxy + iptables egress lockdown.
#
# Required env vars:
#   SQUID_IMAGE        — Docker image (pinned by digest)
#   GITHUB_WORKSPACE   — Repository checkout path (set by GitHub Actions)
#
# This script is called BEFORE the Claude Code Action step to ensure
# all outbound traffic is routed through the Squid proxy, which enforces
# a domain allowlist defined in .github/squid/sandbox-proxy-rules.conf.

set -euo pipefail

# ── Load or pull Squid image ────────────────────────────────────────

if [ -f /tmp/squid-image.tar ] && docker load < /tmp/squid-image.tar; then
  : # cached image loaded successfully
else
  rm -f /tmp/squid-image.tar
  docker pull "$SQUID_IMAGE"
  docker save "$SQUID_IMAGE" > /tmp/squid-image.tar
fi

# ── Start Squid proxy ───────────────────────────────────────────────

docker run -d --name sandbox-proxy -p 3128:3128 \
  -v "${GITHUB_WORKSPACE}/.github/squid/sandbox-proxy-rules.conf:/etc/squid/conf.d/00-sandbox-proxy-rules.conf:ro" \
  "$SQUID_IMAGE"

# Wait for readiness (api.github.com returns 200 without auth)
for i in $(seq 1 30); do
  curl -sf -x http://127.0.0.1:3128 -o /dev/null https://api.github.com 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "::error::Squid proxy failed to start"; docker logs sandbox-proxy; exit 1; }
  sleep 2
done

# Verify: allowed domain works, blocked domain is rejected
HTTP_CODE=$(curl -s -x http://127.0.0.1:3128 -o /dev/null -w '%{http_code}' https://api.github.com)
if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 400 ]; then
  echo "::error::Allowed domain returned $HTTP_CODE"; exit 1
fi
if curl -sf -x http://127.0.0.1:3128 -o /dev/null https://google.com 2>/dev/null; then
  echo "::error::Blocked domain reachable!"; exit 1
fi

# ── Lock down iptables ──────────────────────────────────────────────

SQUID_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' sandbox-proxy)
if [ -z "$SQUID_IP" ]; then
  echo "::error::Could not determine Squid container IP"; exit 1
fi
echo "Squid IP: $SQUID_IP"

# Apply iptables atomically — if any rule fails, roll back and abort.
rollback_iptables() {
  sudo iptables -F OUTPUT 2>/dev/null || true
  sudo iptables -F DOCKER-USER 2>/dev/null || true
  if command -v ip6tables >/dev/null 2>&1; then
    sudo ip6tables -F OUTPUT 2>/dev/null || true
  fi
  echo "::error::iptables application failed — rolled back"; exit 1
}
trap rollback_iptables ERR

# IPv4: allow only proxy traffic, block all other egress
sudo iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A OUTPUT -o lo -p tcp --dport 3128 -j ACCEPT
sudo iptables -A OUTPUT -d "$SQUID_IP" -p tcp --dport 3128 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --syn -j REJECT --reject-with tcp-reset
sudo iptables -A OUTPUT -p udp -j DROP
sudo iptables -A OUTPUT -p icmp -j DROP

# IPv6: mirror restrictions
if command -v ip6tables >/dev/null 2>&1; then
  sudo ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  sudo ip6tables -A OUTPUT -o lo -p tcp --dport 3128 -j ACCEPT
  sudo ip6tables -A OUTPUT -p tcp --syn -j REJECT --reject-with tcp-reset
  sudo ip6tables -A OUTPUT -p udp -j DROP
  sudo ip6tables -A OUTPUT -p ipv6-icmp -j DROP
fi

# Container egress lockdown (DOCKER-USER):
#   - Squid container CAN access internet (domain filtering via ACL)
#   - Other containers can ONLY talk to Squid:3128
sudo iptables -I DOCKER-USER 1 -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -I DOCKER-USER 2 -s "$SQUID_IP" -j ACCEPT
sudo iptables -I DOCKER-USER 3 -d "$SQUID_IP" -p tcp --dport 3128 -j ACCEPT
sudo iptables -I DOCKER-USER 4 -j DROP

trap - ERR

# Flush conntrack so pre-lockdown connections don't survive
sudo conntrack -F 2>/dev/null || true

# ── Verify lockdown ────────────────────────────────────────────────

if curl -sf --max-time 5 -o /dev/null https://google.com 2>/dev/null; then
  echo "::error::Direct connection not blocked!"; exit 1
fi

if ! curl -sf --max-time 10 -x http://127.0.0.1:3128 -o /dev/null https://api.github.com 2>/dev/null; then
  echo "::error::Proxy broken after iptables lockdown!"; exit 1
fi

if docker run --rm --entrypoint /bin/bash "$SQUID_IMAGE" -lc "timeout 5 openssl s_client -connect google.com:443 -brief </dev/null" >/dev/null 2>&1; then
  echo "::error::Container egress bypass detected (google.com reachable directly)"; exit 1
fi

echo "Network sandbox active"
