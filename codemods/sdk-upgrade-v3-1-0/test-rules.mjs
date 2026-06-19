#!/usr/bin/env node
// Fixture tests for the ast-grep YAML rules in rules/.
//
// The native `codemod jssg test` harness (see test.sh) only covers the JSSG
// scripts/ transforms — the declarative rules/*.yml had fixtures but nothing ran
// them. This runner closes that gap with the same tests/<change>/ convention:
// each rule has tests/<rule-file-stem>/ holding either a flat input.tsx/expected.tsx
// or <case>/ subdirs. It applies the rule to a temp copy, compares (whitespace-
// normalised, since codemods edit but don't format), and checks idempotency.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(pkgDir, "..", "..");
const astGrep = join(repoRoot, "node_modules", ".bin", "ast-grep");
const rulesDir = join(pkgDir, "rules");
const testsDir = join(pkgDir, "tests");

const norm = (s) => s.replace(/\s+/g, " ").trim();

function casesFor(stem) {
  const dir = join(testsDir, stem);
  if (!existsSync(dir)) {
    return [];
  }
  if (existsSync(join(dir, "input.tsx"))) {
    return [{ name: stem, dir }];
  }
  return readdirSync(dir)
    .map((d) => ({ name: `${stem}/${d}`, dir: join(dir, d) }))
    .filter((c) => statSync(c.dir).isDirectory() && existsSync(join(c.dir, "input.tsx")));
}

function applyRule(rulePath, target) {
  execFileSync(astGrep, ["scan", "-r", rulePath, target, "-U"], { stdio: ["ignore", "ignore", "inherit"] });
}

let failed = 0;
let ran = 0;

for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".yml"))) {
  const stem = file.replace(/\.yml$/, "");
  const rulePath = join(rulesDir, file);
  const cases = casesFor(stem);
  if (cases.length === 0) {
    console.log(`✗ ${stem}: no fixtures under tests/${stem}/`);
    failed++;
    continue;
  }
  for (const { name, dir } of cases) {
    ran++;
    const tmp = mkdtempSync(join(tmpdir(), "rule-"));
    try {
      const target = join(tmp, "input.tsx");
      cpSync(join(dir, "input.tsx"), target);
      applyRule(rulePath, target);
      const got = readFileSync(target, "utf8");
      const want = readFileSync(join(dir, "expected.tsx"), "utf8");
      if (norm(got) !== norm(want)) {
        console.log(`FAIL ${name}`);
        console.log(`  want: ${norm(want)}`);
        console.log(`  got:  ${norm(got)}`);
        failed++;
        continue;
      }
      // Idempotency: re-applying must not change the (already-migrated) output.
      applyRule(rulePath, target);
      if (norm(readFileSync(target, "utf8")) !== norm(got)) {
        console.log(`FAIL ${name} (not idempotent — second apply changed the output)`);
        failed++;
        continue;
      }
      console.log(`ok   ${name}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

console.log(`\n${ran} rule case(s), ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
