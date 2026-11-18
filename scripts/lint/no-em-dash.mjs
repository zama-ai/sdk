#!/usr/bin/env node
// Fails when a diff adds an em dash (U+2014). Only added lines are checked,
// so existing em dashes don't block unrelated changes.
//
//   node scripts/lint/no-em-dash.mjs           # staged changes (pre-commit)
//   node scripts/lint/no-em-dash.mjs <rev>     # changes from <rev> to HEAD (CI)

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EM_DASH = "\u2014";

// CHANGELOG.md is built from commit messages, which this check can't see, and
// llms*.txt is built from docs this check already covers.
const GENERATED_FILES = [
  ":(exclude,glob)**/CHANGELOG.md",
  ":(exclude)llms.txt",
  ":(exclude)llms-full.txt",
];

/**
 * @param {string} diff Output of `git diff --unified=0`.
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findAddedEmDashes(diff) {
  const hits = [];
  let file = null;
  let line = 0;
  let inHeader = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inHeader = true;
      continue;
    }
    if (inHeader && raw.startsWith("+++ ")) {
      const path = raw.slice(4);
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      inHeader = false;
      line = Number(hunk[1]);
      continue;
    }
    if (inHeader || !file || !raw.startsWith("+")) {
      continue;
    }
    if (raw.includes(EM_DASH)) {
      hits.push({ file, line, text: raw.slice(1).trim() });
    }
    line++;
  }
  return hits;
}

const entry = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entry) {
  const rev = process.argv[2];
  const range = rev ? [rev, "HEAD"] : ["--cached"];
  const diff = execFileSync(
    "git",
    [
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "-M",
      ...range,
      "--",
      ".",
      ...GENERATED_FILES,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const hits = findAddedEmDashes(diff);
  for (const { file, line, text } of hits) {
    console.error(`${file}:${line}: ${text}`);
  }
  if (hits.length > 0) {
    console.error(
      `\nFound ${hits.length} added em dash(es) (${EM_DASH}). Use a comma, colon, period, or parentheses instead.`,
    );
    process.exit(1);
  }
}
