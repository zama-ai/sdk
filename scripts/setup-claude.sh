#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPO_ROOT/claude-setup"
TARGET="$REPO_ROOT/.claude"

if [ -d "$TARGET" ]; then
  echo "⚠️  .claude/ already exists. Overwrite? (y/N)"
  read -r answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
  rm -rf "$TARGET"
fi

cp -R "$SOURCE" "$TARGET"
echo "✅ .claude/ created from claude-setup/"

# Check if claude CLI is available
if ! command -v claude &> /dev/null; then
  echo ""
  echo "⚠️  Claude Code CLI not found. Install it first, then run:"
  echo "  claude plugin marketplace add zama-ai/zama-marketplace"
  echo "  claude plugin install zama-developer@zama-marketplace --scope project"
  exit 0
fi

echo "📦 Adding zama-marketplace..."
claude plugin marketplace add zama-ai/zama-marketplace

echo "🔌 Installing zama-developer plugin..."
claude plugin install zama-developer@zama-marketplace --scope project

echo ""
echo "✅ Claude Code setup complete!"
