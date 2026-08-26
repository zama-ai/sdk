// Assert the committed doc URLs target the expected publish branch.
//
//   pnpm docs:check-target <main|beta>
//
// Runs in CI with the PR's base branch (github.base_ref) — which, unlike a local
// git branch name, is reliable in CI's detached-HEAD PR checkout and is exactly
// where the PR will land. If the committed URLs point at the other branch/space
// (e.g. a beta→main promotion that forgot to flip them), this fails and
// tells you to run `pnpm docs:retarget <branch>`. Idempotent partner to retarget.mjs.
// `alpha` has no doc space of its own, so it's not a valid target here — see below.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const BRANCH_TO_SPACE = { main: "stable", beta: "beta" };

// `stable` is GitBook's default space and is omitted from docs.zama.org URLs, so a
// stale stable-form URL on the beta branch has *no* space segment at all — we
// can't catch it by looking for a literal wrong segment (the old approach silently
// missed it). Instead read the actual space — the segment after /protocol/sdk/, or
// the implicit `stable` when none is present — and compare it to what's expected.
const SPACE_URL_RE = /docs\.zama\.org\/protocol\/sdk\/(?:(beta|stable)\/)?/g;

/**
 * Human-readable problems with the branch/space URLs in `content` for a PR
 * landing on `expected` (`main` or `beta`). Empty array means clean.
 */
export function findUrlProblems(content, expected) {
  const space = BRANCH_TO_SPACE[expected];
  const otherBranch = expected === "main" ? "beta" : "main";
  const problems = [];

  if (content.includes(`raw.githubusercontent.com/zama-ai/sdk/${otherBranch}/`)) {
    problems.push(`links to the "${otherBranch}" branch (expected "${expected}")`);
  }

  for (const match of content.matchAll(SPACE_URL_RE)) {
    const actualSpace = match[1] ?? "stable";
    if (actualSpace !== space) {
      problems.push(`links to the "${actualSpace}" GitBook space (expected "${space}")`);
      break; // one space mismatch per file is enough to flag it
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
  const repoRoot = process.cwd();

  const expected = process.argv[2];
  if (!Object.hasOwn(BRANCH_TO_SPACE, expected)) {
    // Not a publish branch (e.g. a feature→feature PR, or the docs-less `alpha`
    // protocol-testing branch) — nothing to assert.
    console.log(`docs:check-target: "${expected ?? "(nothing)"}" is not main/beta; skipping.`);
    process.exit(0);
  }
  const space = BRANCH_TO_SPACE[expected];

  const docFiles = [
    ...walkMarkdown(join(repoRoot, "docs/gitbook/src")),
    join(repoRoot, "README.md"),
    join(repoRoot, "packages/sdk/README.md"),
    join(repoRoot, "packages/react-sdk/README.md"),
  ];

  const rel = (p) => p.replace(`${repoRoot}/`, "");
  const problems = [];

  for (const file of docFiles) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const problem of findUrlProblems(content, expected)) {
      problems.push(`${rel(file)}: ${problem}`);
    }
  }

  const configPath = join(repoRoot, "docs/llm/corpus.config.json");
  const { rawGithubBaseUrl } = JSON.parse(readFileSync(configPath, "utf8"));
  if (!rawGithubBaseUrl.replace(/\/+$/u, "").endsWith(`/zama-ai/sdk/${expected}`)) {
    problems.push(
      `docs/llm/corpus.config.json: rawGithubBaseUrl is "${rawGithubBaseUrl}" (expected branch "${expected}")`,
    );
  }

  if (problems.length > 0) {
    console.error(
      `✖ Doc URLs do not target "${expected}":\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    console.error(`\nFix: pnpm docs:retarget ${expected}`);
    process.exit(1);
  }

  console.log(`✓ Doc URLs target the "${expected}" branch / "${space}" GitBook space.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
