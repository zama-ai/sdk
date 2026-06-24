// Retarget the doc URLs to a publish branch and rebuild the LLM corpus.
//
//   pnpm docs:retarget <main|prerelease>
//
// Two kinds of branch-specific URL live in the docs (see docs/llm/corpus.config.json
// and the migration guide):
//   - raw.githubusercontent.com/zama-ai/sdk/<branch>/...  — main on the release
//     branch, prerelease on the prerelease branch (the files only exist on `main`
//     after a release).
//   - docs.zama.org/protocol/sdk/<space>/....md           — the GitBook space the
//     branch publishes to: `main` → `stable`, `prerelease` → `alpha`. `stable` is
//     GitBook's default space and is omitted from the URL, so only `alpha` ever
//     appears as a path segment: promotion *inserts* `alpha/` (main→prerelease) or
//     *removes* it (prerelease→main), it isn't a fixed-segment swap.
//
// They can't be derived at build time: CI checks out PRs as a detached HEAD, so
// there's no branch to read, and the committed artifacts must match the rebuild.
// So the branch is committed (in corpus.config.json + the hand-authored links) and
// flipped at promotion with this one command, which is idempotent — running it for
// the branch you're already on is a no-op.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Publish branch → GitBook space. */
export const BRANCH_TO_SPACE = { main: "stable", prerelease: "alpha" };

/**
 * Rewrite the branch/space URLs in `content` to target `target` (`main` or
 * `prerelease`). `stable` is the default (omitted) space, so the docs.zama.org
 * rewrite inserts or removes the `alpha/` segment rather than swapping a fixed
 * one. Idempotent: retargeting to the branch the content already targets is a
 * no-op.
 */
export function retargetUrls(content, target) {
  const space = BRANCH_TO_SPACE[target];
  const spaceSegment = space === "stable" ? "" : `${space}/`;
  return content
    .replace(
      /(raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|prerelease)(\/)/g,
      `$1${target}$2`,
    )
    .replace(/(docs\.zama\.org\/protocol\/sdk\/)(?:(?:alpha|stable)\/)?/g, `$1${spaceSegment}`);
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
  const repoRoot = process.cwd();

  const target = process.argv[2];
  if (!Object.hasOwn(BRANCH_TO_SPACE, target)) {
    console.error(`Usage: pnpm docs:retarget <main|prerelease>\nGot: ${target ?? "(nothing)"}`);
    process.exit(1);
  }
  const space = BRANCH_TO_SPACE[target];

  // Hand-authored sources that may carry branch/space URLs: the GitBook docs plus
  // the package READMEs that feed the corpus.
  const docFiles = [
    ...walkMarkdown(join(repoRoot, "docs/gitbook/src")),
    join(repoRoot, "README.md"),
    join(repoRoot, "packages/sdk/README.md"),
    join(repoRoot, "packages/react-sdk/README.md"),
  ];

  const changed = [];
  for (const file of docFiles) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // optional file (e.g. a README that doesn't exist) — skip
    }
    const updated = retargetUrls(content, target);
    if (updated !== content) {
      writeFileSync(file, updated);
      changed.push(file);
    }
  }

  // corpus.config.json drives every generated link in llms.txt / llms-full.txt /
  // corpus-manifest.json via rawGithubBaseUrl.
  const configPath = join(repoRoot, "docs/llm/corpus.config.json");
  const config = readFileSync(configPath, "utf8");
  const updatedConfig = config.replace(
    /(https:\/\/raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|prerelease)/,
    `$1${target}`,
  );
  if (updatedConfig !== config) {
    writeFileSync(configPath, updatedConfig);
    changed.push(configPath);
  }

  const rel = (p) => p.replace(`${repoRoot}/`, "");
  console.log(`Retargeting docs to branch "${target}" (GitBook space "${space}").`);
  console.log(
    changed.length > 0
      ? `Updated ${changed.length} file(s):\n${changed.map((f) => `  ${rel(f)}`).join("\n")}`
      : "No URL changes — sources already target this branch.",
  );

  console.log("\nRebuilding the LLM corpus...");
  const build = spawnSync("pnpm", ["llm:build"], { stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  // Keep the result commit-clean (oxfmt also formats Markdown + JSON).
  if (changed.length > 0) {
    const fmt = spawnSync("pnpm", ["exec", "oxfmt", ...changed], { stdio: "inherit" });
    if (fmt.status !== 0) {
      process.exit(fmt.status ?? 1);
    }
  }

  console.log(
    `\n✓ Retargeted to "${target}". Commit the changes (sources + regenerated artifacts).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
