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

import { D2 } from "@terrastruct/d2";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const DIAGRAMS_DIR = join(REPO_ROOT, "docs", "diagrams");
const GITBOOK_IMAGES = join(REPO_ROOT, "docs", "gitbook", "src", "images");

const IN = DIAGRAMS_DIR;
const OUT = GITBOOK_IMAGES;

const d2Files = readdirSync(IN).filter((f) => f.endsWith(".d2"));

if (d2Files.length === 0) {
  console.log("No .d2 files found in docs/diagrams/");
  process.exit(0);
}

const d2 = new D2();
let errors = 0;

for (const file of d2Files) {
  const src = join(IN, file);
  const out = join(OUT, file.replace(/\.d2$/, ".svg"));
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

// Summary
const svgCount = readdirSync(OUT).filter((f) => f.endsWith(".svg")).length;
console.log(`\nGenerated ${svgCount} SVG files in ${OUT.toString()}`);

if (errors) {
  console.error("Some diagrams failed to render. See errors above.");
  process.exit(1);
}

process.exit(0);
