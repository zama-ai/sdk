#!/usr/bin/env bash
# Run the native JSSG harness (https://docs.codemod.com/jssg/testing) for every
# transform in scripts/. `codemod jssg test` takes one codemod file + one test
# directory, so we run it once per scripts/<name>.ts against its fixtures in
# tests/<name>/ (each <case>/{input,expected}.tsx is a case).
#
# Convention, enforced here: every scripts/<name>.ts has a matching tests/<name>/
# directory — a script with no fixtures errors out and fails the run.
#
# --strictness ast: codemods edit but don't format, so the raw output isn't
# byte-identical to the (formatted) expected.tsx; comparing ASTs ignores
# formatting. Pass extra flags through ("$@"), e.g. `./test.sh -u` to update
# fixtures or `./test.sh --filter <case>`.
set -euo pipefail

cd "$(dirname "$0")"
# Make the workspace's `codemod` binary resolvable when run directly (pnpm already
# adds this to PATH for `pnpm test`).
PATH="$PWD/node_modules/.bin:$PATH"

rc=0
for f in scripts/*.ts; do
  name=$(basename "$f" .ts)
  echo "==> $name"
  if ! codemod jssg test -l tsx --strictness ast "$@" "$f" "tests/$name"; then
    rc=1
  fi
done

# The native harness only covers scripts/ (JSSG). The declarative rules/*.yml are
# exercised by a sibling runner against the same tests/<rule>/ fixtures.
echo "==> ast-grep rules (rules/*.yml)"
if ! node test-rules.mjs; then
  rc=1
fi

# Whole-chain convergence + idempotency on a multi-file target (workflow order).
echo "==> end-to-end chain (tests/_e2e)"
if ! node test-e2e.mjs; then
  rc=1
fi

exit "$rc"
