#!/usr/bin/env node
/**
 * Generate SVG images from D2 diagram sources.
 *
 * Outputs go to docs/diagrams/ alongside the source files,
 * and are copied to docs/gitbook/src/images/ for gitbook embedding.
 *
 * Uses @terrastruct/d2 (WASM) — no native binary required.
 *
 * Usage: node scripts/docs/generate-diagrams.mjs
 */

import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { D2 } from "@terrastruct/d2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const DIAGRAMS_DIR = join(REPO_ROOT, "docs", "diagrams");
const GITBOOK_IMAGES = join(REPO_ROOT, "docs", "gitbook", "src", "images");

const d2Files = readdirSync(DIAGRAMS_DIR).filter((f) => f.endsWith(".d2"));

if (d2Files.length === 0) {
  console.log("No .d2 files found in docs/diagrams/");
  process.exit(0);
}

const d2 = new D2();
let errors = 0;

for (const file of d2Files) {
  const src = join(DIAGRAMS_DIR, file);
  const out = join(DIAGRAMS_DIR, file.replace(/\.d2$/, ".svg"));
  const outName = basename(out);

  try {
    const source = readFileSync(src, "utf-8");
    const compiled = await d2.compile(source);
    const svg = await d2.render(compiled.diagram);
    writeFileSync(out, svg);
    console.log(`D2: ${file} -> ${outName}`);
  } catch (err) {
    console.error(`ERROR: Failed to render ${file}: ${err.message}`);
    errors = 1;
  }
}

// Copy SVGs to gitbook images
if (existsSync(GITBOOK_IMAGES)) {
  for (const file of readdirSync(DIAGRAMS_DIR).filter((f) => f.endsWith(".svg"))) {
    copyFileSync(join(DIAGRAMS_DIR, file), join(GITBOOK_IMAGES, file));
  }
  console.log("Copied SVGs to docs/gitbook/src/images/");
}

// Summary
const svgCount = readdirSync(DIAGRAMS_DIR).filter((f) => f.endsWith(".svg")).length;
console.log(`\nGenerated ${svgCount} SVG files in docs/diagrams/`);

if (errors) {
  console.error("Some diagrams failed to render. See errors above.");
  process.exit(1);
}
