#!/usr/bin/env bash
set -euo pipefail

next_version="${1:-}"
if [[ -z "$next_version" ]]; then
  echo "Usage: scripts/release/publish-lockstep.sh <next-version>"
  exit 1
fi

sdk_version="$(node -p "require('./packages/sdk/package.json').version")"
react_version="$(node -p "require('./packages/react-sdk/package.json').version")"

if [[ "$sdk_version" != "$next_version" || "$react_version" != "$next_version" ]]; then
  echo "Package versions are not aligned to $next_version (sdk=$sdk_version react=$react_version)"
  exit 1
fi

pnpm --filter @zama-fhe/sdk publish --access public --no-git-checks
pnpm --filter @zama-fhe/react-sdk publish --access public --no-git-checks
