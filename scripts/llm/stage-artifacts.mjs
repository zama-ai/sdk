import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function runInherit(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const stagedFiles = run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
  .split("\n")
  .filter(Boolean);

const corpusSourcePatterns = [
  /^README\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/README\.md$/u,
  /^docs\/gitbook\/src\/.+\.md$/u,
  /^docs\/gitbook\/\.gitbook\/includes\/.+\.md$/u,
  /^docs\/llm\/corpus\.config\.json$/u,
  /^examples\/[^/]+\/(?:README|WALKTHROUGH)\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/etc\/.+\.api\.md$/u,
  /^scripts\/llm\/.+\.mjs$/u,
];

if (!stagedFiles.some((file) => corpusSourcePatterns.some((pattern) => pattern.test(file)))) {
  process.exit(0);
}

console.log("LLM corpus source changed; regenerating llms.txt artifacts...");
runInherit("pnpm", ["llm:build"]);
runInherit("git", ["add", "llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"]);
