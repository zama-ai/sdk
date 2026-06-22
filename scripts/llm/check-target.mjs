// Assert the committed doc URLs target the expected publish branch.
//
//   pnpm llm:check-target <main|prerelease>
//
// Runs in CI with the PR's base branch (github.base_ref) — which, unlike a local
// git branch name, is reliable in CI's detached-HEAD PR checkout and is exactly
// where the PR will land. If the committed URLs point at the other branch/space
// (e.g. a prerelease→main promotion that forgot to flip them), this fails and
// tells you to run `pnpm llm:retarget <branch>`. Idempotent partner to retarget.mjs.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const BRANCH_TO_SPACE = { main: "stable", prerelease: "alpha" };

const expected = process.argv[2];
if (!Object.hasOwn(BRANCH_TO_SPACE, expected)) {
  // Not a publish branch (e.g. a feature→feature PR) — nothing to assert.
  console.log(`llm:check-target: "${expected ?? "(nothing)"}" is not main/prerelease; skipping.`);
  process.exit(0);
}
const space = BRANCH_TO_SPACE[expected];
const otherBranch = expected === "main" ? "prerelease" : "main";
const otherSpace = space === "stable" ? "alpha" : "stable";

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

const docFiles = [
  ...walkMarkdown(join(repoRoot, "docs/gitbook/src")),
  join(repoRoot, "README.md"),
  join(repoRoot, "packages/sdk/README.md"),
  join(repoRoot, "packages/react-sdk/README.md"),
];

const wrongBranchUrl = new RegExp(`raw\\.githubusercontent\\.com/zama-ai/sdk/${otherBranch}/`);
const wrongSpaceUrl = new RegExp(`docs\\.zama\\.org/protocol/sdk/${otherSpace}/`);
const rel = (p) => p.replace(`${repoRoot}/`, "");

const problems = [];

for (const file of docFiles) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (wrongBranchUrl.test(content)) {
    problems.push(`${rel(file)}: links to the "${otherBranch}" branch (expected "${expected}")`);
  }
  if (wrongSpaceUrl.test(content)) {
    problems.push(`${rel(file)}: links to the "${otherSpace}" GitBook space (expected "${space}")`);
  }
}

const configPath = join(repoRoot, "docs/llm/corpus.config.json");
const { rawGithubBaseUrl } = JSON.parse(readFileSync(configPath, "utf8"));
if (!new RegExp(`/zama-ai/sdk/${expected}/?$`).test(rawGithubBaseUrl)) {
  problems.push(
    `docs/llm/corpus.config.json: rawGithubBaseUrl is "${rawGithubBaseUrl}" (expected branch "${expected}")`,
  );
}

if (problems.length > 0) {
  console.error(
    `✖ Doc URLs do not target "${expected}":\n${problems.map((p) => `  - ${p}`).join("\n")}`,
  );
  console.error(`\nFix: pnpm llm:retarget ${expected}`);
  process.exit(1);
}

console.log(`✓ Doc URLs target the "${expected}" branch / "${space}" GitBook space.`);
