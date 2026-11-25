#!/usr/bin/env node
// Fails when a change adds an em dash (U+2014) or a stand-in for one: a spaced
// en dash, or a spaced double hyphen or hyphen in Markdown prose or a comment.
// Only added lines are checked, so existing dashes don't block unrelated
// changes.
//
//   node scripts/lint/no-em-dash.mjs                # staged changes
//   node scripts/lint/no-em-dash.mjs <files...>     # uncommitted changes in these files (lint-staged, agent hook)
//   node scripts/lint/no-em-dash.mjs --base <rev>   # changes from <rev> to HEAD (CI)

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EM_DASH = "\u2014";

// Syntax that puts a dash between words: TSDoc tags (`@param name - text`),
// lint directive reasons (`@ts-expect-error -- text`), and Go's generated-code
// header.
const DASH_SYNTAX = /@(?:param|typeParam|returns?|throws)\b|@ts-|(?:es|ox)lint-disable|DO NOT EDIT/;
const COMMENT = /(?:\/\/[/!]?|\/\*\*?|^\s*\*|^\s*#)\s(.*)/;
// `--` and ` - ` are syntax in code (`a - b`, `git log -- src`), so outside
// Markdown prose only comments are checked for them. A comment can still quote
// a command, so `--` before a flag, path, or variable is allowed.
const WORD_END = /^(?!-).*[\p{L}\p{N})\]*_,.:;!?'"`]$/u;
const SHELL_ARG = /^[-$"'<{[]|\/|\.[A-Za-z0-9]{1,5}$/;

/**
 * The line numbers of a Markdown file that sit inside a code fence.
 *
 * @param {string} markdown
 * @returns {Set<number>}
 */
export function codeFences(markdown) {
  const fenced = new Set();
  let open = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*(?:```|~~~)/.test(text)) {
      open = !open;
    } else if (open) {
      fenced.add(i + 1);
    }
  });
  return fenced;
}

/**
 * Whether `text`, a line of `file`, uses an em dash or a stand-in for one.
 * Inline code spans are ignored. Pass a non-Markdown `file` name for a line in
 * a Markdown code fence.
 */
export function hasDash(text, file) {
  if (text.includes(EM_DASH)) {
    return true;
  }
  const prose = text.replace(/`[^`]*`/g, "``");
  if (/\s\u2013\s/.test(prose)) {
    return true;
  }
  const comment = /\.mdx?$/.test(file) ? prose : COMMENT.exec(prose)?.[1];
  if (comment === undefined || DASH_SYNTAX.test(comment)) {
    return false;
  }
  const words = comment.trim().split(/\s+/);
  for (let i = 1; i < words.length - 1; i++) {
    if (words[i] === "--" && WORD_END.test(words[i - 1]) && !SHELL_ARG.test(words[i + 1])) {
      return true;
    }
  }
  return /[\p{L}\p{N})`*"] - [\p{L}(`*"]/u.test(comment);
}

function lineContext(file, line, fences) {
  return fences?.has(line) ? "code-fence" : file;
}

// CHANGELOG.md is built from commit messages, which this check can't see, and
// llms*.txt is built from docs this check already covers.
const GENERATED_FILES = [
  ":(top,exclude,glob)**/CHANGELOG.md",
  ":(top,exclude)llms.txt",
  ":(top,exclude)llms-full.txt",
];

/**
 * @param {string} diff Output of `git diff --unified=0`.
 * @param {(file: string) => string} [readNew] Reads a file's new content, so
 *   lines inside Markdown code fences are checked as code.
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findAddedEmDashes(diff, readNew = () => "") {
  const hits = [];
  const fences = new Map();
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
    if (/\.mdx?$/.test(file) && !fences.has(file)) {
      fences.set(file, codeFences(readNew(file)));
    }
    if (hasDash(raw.slice(1), lineContext(file, line, fences.get(file)))) {
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
    .flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const fences = codeFences(content);
      return content
        .split("\n")
        .map((text, i) => ({ file, line: i + 1, text: text.trim() }))
        .filter(({ text, line }) => hasDash(text, lineContext(file, line, fences)));
    });
}

// The new side of a diff: a commit, the index, or the working tree.
function reader(rev) {
  return (file) => {
    try {
      return rev === undefined ? readFileSync(file, "utf8") : git(["show", `${rev}:${file}`]);
    } catch {
      return "";
    }
  };
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
    return findAddedEmDashes(diffAgainst([args[1], "HEAD"], [":/"]), reader("HEAD"));
  }
  // A merge commit stages the other branch's lines, which were reviewed there.
  if (isMerging()) {
    return [];
  }
  if (args.length === 0) {
    return findAddedEmDashes(diffAgainst(["--cached"], [":/"]), reader(""));
  }
  return [...findAddedEmDashes(diffAgainst(["HEAD"], args), reader()), ...untrackedHits(args)];
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
      `\nFound ${hits.length} added em dash(es) (${EM_DASH}) or stand-ins (--, \u2013, or a spaced hyphen). Rewrite the sentence instead of swapping in other punctuation. Two shorter sentences usually read best.`,
    );
    process.exit(1);
  }
}
