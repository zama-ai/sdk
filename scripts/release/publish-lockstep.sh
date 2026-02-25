#!/usr/bin/env bash
set -euo pipefail

next_version="${1:-}"
channel="${2:-}"
if [[ -z "$next_version" ]]; then
  echo "Usage: scripts/release/publish-lockstep.sh <next-version> [channel]"
  exit 1
fi

sdk_version="$(node -p "require('./packages/sdk/package.json').version")"
react_version="$(node -p "require('./packages/react-sdk/package.json').version")"

if [[ "$sdk_version" != "$next_version" || "$react_version" != "$next_version" ]]; then
  echo "Package versions are not aligned to $next_version (sdk=$sdk_version react=$react_version)"
  exit 1
fi

publish_args=(--access public --no-git-checks)
if [[ -n "$channel" ]]; then
  publish_args+=(--tag "$channel")
fi

pnpm --filter @zama-fhe/sdk publish "${publish_args[@]}"
pnpm --filter @zama-fhe/react-sdk publish "${publish_args[@]}"
