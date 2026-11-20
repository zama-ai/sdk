#!/usr/bin/env node
// Fails when docs, examples or source comments restate a fact outside its one
// home page. A fact written in several places goes stale in all but one of
// them when the behavior changes.
//
//   node scripts/lint/single-source-facts.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Each fact: a pattern for a sentence that states it, and the one file allowed to. */
export const FACTS = [
  {
    id: "pending-unshield-save-timing",
    // "persists/saves ... when/once/after/as soon as ... wallet/phase 1/mined/submit", in one sentence.
    pattern:
      /\b(?:persist(?:s|ed)?|saves?|saved)\b[^.]{0,150}?\b(?:as soon as|once|after|when)\b[^.]{0,200}?\b(?:wallet|phase 1|mined|submit(?:s|ted)?)\b/gi,
    home: "docs/gitbook/src/guides/unshield-tokens.md",
    message:
      "When the SDK saves a pending unshield is stated only in docs/gitbook/src/guides/unshield-tokens.md#4-handle-interrupted-unshields. Link there instead of restating it.",
  },
];

// `glob` magic, so `**/` also matches no directory at all.
const PATHSPECS = [
  ":(glob)docs/gitbook/src/**/*.md",
  ":(glob)examples/**/*.md",
  ":(glob)examples/**/*.ts",
  ":(glob)examples/**/*.tsx",
  ":(glob)packages/*/src/**/*.ts",
  ":(glob)packages/*/src/**/*.tsx",
  // Release notes record past behavior.
  ":(exclude,glob)docs/gitbook/src/changelog/**",
  ":(exclude,glob)**/CHANGELOG.md",
  ":(exclude,glob)**/__tests__/**",
];

/**
 * Joins wrapped lines, including comment and quote continuations, and blanks
 * Markdown link targets (their dots would end a sentence). Keeps every
 * character offset, so a match maps back to its line.
 */
function unwrap(text) {
  const blank = (m) => " ".repeat(m.length);
  return text.replace(/\]\([^)\n]*\)/g, blank).replace(/\n[ \t]*(?:\*(?!\/)|\/\/|>)?/g, blank);
}

/**
 * @param {{ path: string, text: string }[]} files
 * @returns {{ file: string, line: number, fact: string, message: string }[]}
 */
export function findFactCopies(files) {
  const hits = [];
  for (const { path, text } of files) {
    const flat = unwrap(text);
    for (const fact of FACTS) {
      if (path === fact.home) {
        continue;
      }
      for (const match of flat.matchAll(fact.pattern)) {
        const line = text.slice(0, match.index).split("\n").length;
        hits.push({ file: path, line, fact: fact.id, message: fact.message });
      }
    }
  }
  return hits;
}

function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  // Untracked files too, so a new page is checked before it is added.
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...PATHSPECS],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const files = paths.map((path) => ({ path, text: readFileSync(resolve(root, path), "utf8") }));
  const hits = findFactCopies(files);
  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line}: [${hit.fact}] ${hit.message}`);
  }
  if (hits.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
