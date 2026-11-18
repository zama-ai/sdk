#!/usr/bin/env node
// Fails when .husky/pre-commit runs anything besides lint-staged and the
// whole-repo steps. Per-file checks belong in lint-staged.config.mjs: the agent
// post-edit hook replays only that list, and running it serially keeps every
// check after oxfmt.
//
//   node scripts/lint/pre-commit-hook.mjs [file]   # default: .husky/pre-commit

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXPECTED = [
  "pnpm exec lint-staged --concurrent false",
  "pnpm typecheck",
  "pnpm llm:stage",
];

/**
 * @param {string} text Contents of the pre-commit hook.
 * @returns {string[]} One message per problem.
 */
export function checkPreCommitHook(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const problems = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => !EXPECTED.includes(line))
    .map(
      ({ line, i }) =>
        `line ${i + 1}: \`${line}\` is not an allowed pre-commit step. Add per-file checks to lint-staged.config.mjs ` +
        "instead: the agent post-edit hook replays only that list.",
    );
  for (const expected of EXPECTED) {
    if (!lines.includes(expected)) {
      problems.push(
        `missing \`${expected}\`. lint-staged must run with --concurrent false so checks run after oxfmt.`,
      );
    }
  }
  return problems;
}

const entry = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entry) {
  const file = process.argv[2] ?? ".husky/pre-commit";
  const problems = checkPreCommitHook(readFileSync(file, "utf8"));
  for (const problem of problems) {
    console.error(`${file}: ${problem}`);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
}
