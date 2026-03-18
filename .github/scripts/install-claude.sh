#!/usr/bin/env bash
# Install Claude Code CLI with SHA-512 integrity verification.
#
# Required env vars:
#   CLAUDE_CLI_VERSION   — e.g. "2.1.42"
#   CLAUDE_CLI_INTEGRITY — SHA-512 integrity hash from npm dist.integrity
#                          e.g. "sha512-<base64>"
set -euo pipefail

: "${CLAUDE_CLI_VERSION:?CLAUDE_CLI_VERSION is required}"
: "${CLAUDE_CLI_INTEGRITY:?CLAUDE_CLI_INTEGRITY is required}"

PKG="@anthropic-ai/claude-code"
URL="https://registry.npmjs.org/${PKG}/-/claude-code-${CLAUDE_CLI_VERSION}.tgz"
TMP="/tmp/claude-code.tgz"

echo "Downloading Claude Code CLI v${CLAUDE_CLI_VERSION}..."
curl -fsSL -o "$TMP" "$URL"

# Extract expected base64 hash from the "sha512-<base64>" format
EXPECTED_B64="${CLAUDE_CLI_INTEGRITY#sha512-}"
ACTUAL_B64=$(openssl dgst -sha512 -binary "$TMP" | openssl base64 -A)

if [ "$ACTUAL_B64" != "$EXPECTED_B64" ]; then
  echo "::error::SHA-512 integrity check failed!"
  echo "  Expected: ${EXPECTED_B64}"
  echo "  Got:      ${ACTUAL_B64}"
  rm -f "$TMP"
  exit 1
fi
echo "SHA-512 verified."

npm install -g "$TMP"
rm -f "$TMP"
echo "Claude Code CLI v${CLAUDE_CLI_VERSION} installed."
