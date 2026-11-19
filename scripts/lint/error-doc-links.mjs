#!/usr/bin/env node
// Every bullet in the API reference that names an SDK error links to that error's section in
// errors.md, so a page does not keep its own copy of when the error is thrown.
//
// Usage:
//   node scripts/lint/error-doc-links.mjs              # every reference page
//   node scripts/lint/error-doc-links.mjs <files...>   # these files (lint-staged, agent hook)

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REFERENCE = join(ROOT, "docs/gitbook/src/reference");
const ERRORS_PAGE = join(REFERENCE, "sdk/errors.md");

// A list item whose first word is an error name in code, linked or not.
const ERROR_BULLET = /^\s*[-*]\s+(\[)?`([A-Z][A-Za-z0-9]*Error)`(\]\(([^)]*)\))?/u;

/**
 * The errors with a `### <Name>Error` section in errors.md.
 *
 * @param {string} errorsPage The content of errors.md.
 * @returns {Set<string>}
 */
export function documentedErrors(errorsPage) {
  return new Set([...errorsPage.matchAll(/^### ([A-Z][A-Za-z0-9]*Error)\s*$/gmu)].map((m) => m[1]));
}

/**
 * The problems in one reference page.
 *
 * @param {string} content The page's markdown.
 * @param {string} errorsLink The relative link from the page to errors.md.
 * @param {Set<string>} documented The errors errors.md has a section for.
 * @returns {{ line: number, message: string }[]}
 */
export function findUnlinkedErrors(content, errorsLink, documented) {
  const problems = [];
  let fenced = false;
  content.split("\n").forEach((text, index) => {
    if (/^\s*(```|~~~)/u.test(text)) {
      fenced = !fenced;
    }
    const match = fenced ? null : ERROR_BULLET.exec(text);
    if (match === null) {
      return;
    }
    const [, open, name, linked, target] = match;
    const expected = `${errorsLink}#${name.toLowerCase()}`;
    if (!documented.has(name)) {
      problems.push({
        line: index + 1,
        message: `${name} has no "### ${name}" section in docs/gitbook/src/reference/sdk/errors.md. Add one, then link this bullet to it.`,
      });
    } else if (open === undefined || linked === undefined || target !== expected) {
      problems.push({
        line: index + 1,
        message: `Start the bullet with [\`${name}\`](${expected}). errors.md says when ${name} is thrown; after the link, say only what is specific to this call.`,
      });
    }
  });
  return problems;
}

function referencePages(dir = REFERENCE) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return referencePages(path);
    }
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function main(args) {
  const files = (args.length > 0 ? args.map((file) => resolve(file)) : referencePages()).filter(
    (file) => file.startsWith(`${REFERENCE}/`) && file.endsWith(".md") && file !== ERRORS_PAGE,
  );
  const documented = documentedErrors(readFileSync(ERRORS_PAGE, "utf8"));
  let count = 0;
  for (const file of files) {
    const errorsLink = relative(dirname(file), ERRORS_PAGE);
    for (const { line, message } of findUnlinkedErrors(
      readFileSync(file, "utf8"),
      errorsLink,
      documented,
    )) {
      console.error(`${relative(ROOT, file)}:${line}: ${message}`);
      count += 1;
    }
  }
  if (count > 0) {
    console.error(`\nFound ${count} error bullet(s) without a link to errors.md.`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
