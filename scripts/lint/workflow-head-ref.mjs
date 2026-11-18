#!/usr/bin/env node
// Fails when a workflow condition reads `github.head_ref` without checking that
// the PR comes from this repo. A fork can name its branch `main` or `sync/x`.
//
//   node scripts/lint/workflow-head-ref.mjs [files...]   # default: .github/workflows/*.yml

import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SAME_REPO = "github.event.pull_request.head.repo.full_name == github.repository";

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Returns the line numbers (1-based) of YAML values that read `github.head_ref`
 * but not `github.event.pull_request.head.repo.full_name`.
 * @param {string} text Workflow YAML.
 * @returns {number[]}
 */
export function findUnguardedHeadRefs(text) {
  const lines = text.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("github.head_ref")) {
      continue;
    }
    // The YAML value is the nearest `key:` line at or above, plus the more-indented lines under it.
    let start = i;
    while (start > 0 && !/^\s*(-\s+)?[\w-]+:/.test(lines[start])) {
      start--;
    }
    const keyIndent = indentOf(lines[start]);
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > keyIndent)) {
      end++;
    }
    const value = lines.slice(start, end).join("\n");
    if (
      !value.includes("github.event.pull_request.head.repo.full_name") &&
      !hits.includes(start + 1)
    ) {
      hits.push(start + 1);
    }
  }
  return hits;
}

const entry = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entry) {
  const dir = ".github/workflows";
  const files =
    process.argv.length > 2
      ? process.argv.slice(2)
      : readdirSync(dir)
          .filter((name) => /\.ya?ml$/.test(name))
          .map((name) => join(dir, name));
  let failed = false;
  for (const file of files) {
    for (const line of findUnguardedHeadRefs(readFileSync(file, "utf8"))) {
      failed = true;
      console.error(
        `${file}:${line}: \`github.head_ref\` is chosen by the PR author, including in forks. ` +
          `Pair it with \`${SAME_REPO}\`, as the em dash step in .github/workflows/ci.yml does.`,
      );
    }
  }
  if (failed) {
    process.exit(1);
  }
}
