#!/usr/bin/env bash
set -euo pipefail

# Generate SVG images from D2 and Mermaid diagram sources.
# Outputs go to docs/diagrams/ alongside the source files.
#
# Both d2 and @mermaid-js/mermaid-cli are workspace devDependencies.
# Run `pnpm install` first to ensure they are available.
#
# Usage: ./scripts/docs/generate-diagrams.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIAGRAMS_DIR="$REPO_ROOT/docs/diagrams"
DOCS_DIR="$REPO_ROOT/docs"
D2_BIN="$REPO_ROOT/tools/d2/d2"
MMDC_BIN="$REPO_ROOT/node_modules/.bin/mmdc"

errors=0

# --- D2 diagrams ---
d2_files=$(find "$DIAGRAMS_DIR" -name '*.d2' 2>/dev/null || true)
if [ -n "$d2_files" ]; then
  if [ ! -x "$D2_BIN" ]; then
    echo "ERROR: d2 not found at $D2_BIN. Run: pnpm install"
    errors=1
  else
    for f in $d2_files; do
      out="${f%.d2}.svg"
      echo "D2: $(basename "$f") -> $(basename "$out")"
      if ! "$D2_BIN" "$f" "$out" 2>&1; then
        echo "ERROR: Failed to render $f"
        errors=1
      fi
    done
  fi
fi

# --- Mermaid diagrams (extracted from .md files) ---
md_files=$(find "$DOCS_DIR" -name '*.md' -not -path '*/plans/*' 2>/dev/null || true)
if [ -n "$md_files" ]; then
  has_mermaid=false
  for md in $md_files; do
    if grep -q '```mermaid' "$md" 2>/dev/null; then
      has_mermaid=true
      break
    fi
  done

  if [ "$has_mermaid" = true ]; then
    if [ ! -x "$MMDC_BIN" ]; then
      echo "ERROR: mmdc not found at $MMDC_BIN. Run: pnpm install"
      errors=1
    else
      for md in $md_files; do
        if ! grep -q '```mermaid' "$md" 2>/dev/null; then
          continue
        fi

        base=$(basename "$md" .md)
        block_num=0

        # Extract mermaid blocks using awk
        awk '/```mermaid/{n++; f="'"$DIAGRAMS_DIR"'/mermaid-tmp-"n".mmd"; next} /```/{if(f){close(f); f=""}} f{print > f}' "$md"

        for mmd in "$DIAGRAMS_DIR"/mermaid-tmp-*.mmd; do
          [ -f "$mmd" ] || continue
          block_num=$((block_num + 1))
          out="$DIAGRAMS_DIR/${base}-mermaid-${block_num}.svg"
          echo "Mermaid: $(basename "$md") block $block_num -> $(basename "$out")"
          if ! "$MMDC_BIN" -i "$mmd" -o "$out" -b white 2>&1; then
            echo "ERROR: Failed to render mermaid block $block_num from $md"
            errors=1
          fi
          rm -f "$mmd"
        done
      done
    fi
  fi
fi

# --- Summary ---
svg_count=$(find "$DIAGRAMS_DIR" -name '*.svg' 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Generated $svg_count SVG files in docs/diagrams/"

if [ "$errors" -ne 0 ]; then
  echo "Some diagrams failed to render. See errors above."
  exit 1
fi
