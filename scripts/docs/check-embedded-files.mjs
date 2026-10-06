// Assert that every code block embedding a repository file matches that file.
//
//   pnpm docs:check-embedded
//
// GitBook cannot include files from the repository, so pages such as the daemon
// deployment guide carry a copy. A block titled with a repository path
// ({% code title="packages/..." %}) must equal the file at that path.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EMBED_RE = /\{% code title="([^"]+)" %\}\s*```[^\n]*\n([\s\S]*?)```\s*\{% endcode %\}/g;

/** Repository-path titles only; `main.go` and other file-name titles are illustrative. */
export function isRepositoryPath(title) {
  return title.includes("/") && !title.startsWith("/") && !title.includes("..");
}

/**
 * Problems with the embedded files in one Markdown page. `readFile(path)` returns the
 * repository file's content, or `undefined` when it does not exist.
 */
export function findEmbedProblems(markdown, readFile) {
  const problems = [];
  for (const [, title, block] of markdown.matchAll(EMBED_RE)) {
    if (!isRepositoryPath(title)) {
      continue;
    }
    const file = readFile(title);
    if (file === undefined) {
      problems.push(`embeds ${title}, which does not exist`);
    } else if (file.trimEnd() !== block.trimEnd()) {
      problems.push(`embeds ${title}, but the block differs from the file`);
    }
  }
  return problems;
}

function walkMarkdown(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkMarkdown(path, acc);
    } else if (path.endsWith(".md")) {
      acc.push(path);
    }
  }
  return acc;
}

function main() {
  const root = process.cwd();
  const readFile = (rel) => {
    const path = join(root, rel);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  };
  let failed = false;
  for (const page of walkMarkdown(join(root, "docs/gitbook/src"))) {
    for (const problem of findEmbedProblems(readFileSync(page, "utf8"), readFile)) {
      console.error(`✖ ${page.slice(root.length + 1)} ${problem}`);
      failed = true;
    }
  }
  if (failed) {
    console.error("\nCopy the file into the page again so the embedded block matches it.");
    process.exit(1);
  }
  console.log("✓ Embedded repository files match their sources.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
