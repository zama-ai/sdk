#!/usr/bin/env node
// Fails when a change adds an em dash (U+2014). Only added lines are checked,
// so existing em dashes don't block unrelated changes.
//
//   node scripts/lint/no-em-dash.mjs                # staged changes
//   node scripts/lint/no-em-dash.mjs <files...>     # uncommitted changes in these files (lint-staged, agent hook)
//   node scripts/lint/no-em-dash.mjs --base <rev>   # changes from <rev> to HEAD (CI)

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EM_DASH = "\u2014";

// CHANGELOG.md is built from commit messages, which this check can't see, and
// llms*.txt is built from docs this check already covers.
const GENERATED_FILES = [
  ":(top,exclude,glob)**/CHANGELOG.md",
  ":(top,exclude)llms.txt",
  ":(top,exclude)llms-full.txt",
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
      file = null;
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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function diffAgainst(range, paths) {
  return git([
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "-M",
    ...range,
    "--",
    ...paths,
    ...GENERATED_FILES,
  ]);
}

// Files git doesn't track yet have no diff, so every line counts as added.
function untrackedHits(files) {
  const untracked = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...files,
    ...GENERATED_FILES,
  ]);
  return untracked
    .split("\n")
    .filter(Boolean)
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((text, i) => ({ file, line: i + 1, text: text.trim() }))
        .filter(({ text }) => text.includes(EM_DASH)),
    );
}

function isMerging() {
  try {
    git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function run(args) {
  if (args[0] === "--base") {
    return findAddedEmDashes(diffAgainst([args[1], "HEAD"], [":/"]));
  }
  // A merge commit stages the other branch's lines, which were reviewed there.
  if (isMerging()) {
    return [];
  }
  if (args.length === 0) {
    return findAddedEmDashes(diffAgainst(["--cached"], [":/"]));
  }
  return [...findAddedEmDashes(diffAgainst(["HEAD"], args)), ...untrackedHits(args)];
}

// realpath: Node resolves symlinks in import.meta.url but not in argv, so a
// symlinked checkout would otherwise skip the check silently.
const entry = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entry) {
  const args = process.argv.slice(2);
  const resolved = args[0] === "--base" ? args : args.map((file) => resolve(file));
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  const hits = run(resolved);
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
