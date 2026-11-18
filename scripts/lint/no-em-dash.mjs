#!/usr/bin/env node
// Fails when a diff adds an em dash (U+2014). Only added lines are checked,
// so existing em dashes don't block unrelated changes.
//
//   node scripts/lint/no-em-dash.mjs           # staged changes (pre-commit)
//   node scripts/lint/no-em-dash.mjs <rev>     # changes from <rev> to HEAD (CI)

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EM_DASH = "\u2014";

// Generated files: their content comes from commit messages or other checked sources.
const IGNORED = [/(^|\/)CHANGELOG\.md$/, /^llms(-full)?\.txt$/];

/**
 * @param {string} diff Output of `git diff --unified=0`.
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findAddedEmDashes(diff) {
  const hits = [];
  let file = null;
  let line = 0;
  let prev = "";
  for (const raw of diff.split("\n")) {
    const isHeader = raw.startsWith("+++ ") && prev.startsWith("--- ");
    prev = raw;
    if (isHeader) {
      const path = raw.slice(4);
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || !raw.startsWith("+")) {
      continue;
    }
    if (raw.includes(EM_DASH) && !IGNORED.some((re) => re.test(file))) {
      hits.push({ file, line, text: raw.slice(1).trim() });
    }
    line++;
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rev = process.argv[2];
  const range = rev ? [rev, "HEAD"] : ["--cached"];
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", "--no-ext-diff", "--no-renames", ...range],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
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
