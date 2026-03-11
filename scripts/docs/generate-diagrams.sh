#!/usr/bin/env bash
set -euo pipefail

# Generate SVG images from D2 diagram sources.
# Outputs go to docs/diagrams/ alongside the source files,
# and are copied to docs/gitbook/src/images/ for gitbook embedding.
#
# The d2 binary is a workspace devDependency (tools/d2).
# Run `pnpm install` first to ensure it is available.
#
# Usage: ./scripts/docs/generate-diagrams.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIAGRAMS_DIR="$REPO_ROOT/docs/diagrams"
GITBOOK_IMAGES="$REPO_ROOT/docs/gitbook/src/images"
D2_BIN="$REPO_ROOT/tools/d2/d2"

errors=0

# --- D2 diagrams ---
d2_files=$(find "$DIAGRAMS_DIR" -name '*.d2' 2>/dev/null || true)
if [ -z "$d2_files" ]; then
  echo "No .d2 files found in $DIAGRAMS_DIR"
  exit 0
fi

if [ ! -x "$D2_BIN" ]; then
  echo "ERROR: d2 not found at $D2_BIN. Run: pnpm install"
  exit 1
fi

for f in $d2_files; do
  out="${f%.d2}.svg"
  echo "D2: $(basename "$f") -> $(basename "$out")"
  if ! "$D2_BIN" "$f" "$out" 2>&1; then
    echo "ERROR: Failed to render $f"
    errors=1
  fi
done

# --- Copy SVGs to gitbook images ---
if [ -d "$GITBOOK_IMAGES" ]; then
  for svg in "$DIAGRAMS_DIR"/*.svg; do
    [ -f "$svg" ] || continue
    cp "$svg" "$GITBOOK_IMAGES/$(basename "$svg")"
  done
  echo "Copied SVGs to docs/gitbook/src/images/"
fi

# --- Summary ---
svg_count=$(find "$DIAGRAMS_DIR" -name '*.svg' 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Generated $svg_count SVG files in docs/diagrams/"

if [ "$errors" -ne 0 ]; then
  echo "Some diagrams failed to render. See errors above."
  exit 1
fi
