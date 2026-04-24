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

const corpusSourcePatterns = [
  /^README\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/README\.md$/u,
  /^docs\/gitbook\/src\/.+\.md$/u,
  /^docs\/gitbook\/\.gitbook\/includes\/.+\.md$/u,
  /^docs\/llm\/corpus\.config\.json$/u,
  /^examples\/[^/]+\/(?:README|WALKTHROUGH)\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/etc\/.+\.api\.md$/u,
  /^scripts\/llm\/(?!__tests__\/).+\.mjs$/u,
];

function gitChangedFiles(args) {
  return run("git", args).split("\n").filter(Boolean);
}

function isCorpusSource(file) {
  return corpusSourcePatterns.some((pattern) => pattern.test(file));
}

const stagedCorpusFiles = gitChangedFiles([
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMRD",
]).filter(isCorpusSource);

if (stagedCorpusFiles.length === 0) {
  process.exit(0);
}

const unstagedCorpusFiles = new Set(
  gitChangedFiles(["diff", "--name-only", "--diff-filter=ACMRD"]).filter(isCorpusSource),
);
const partiallyStagedCorpusFiles = stagedCorpusFiles.filter((file) =>
  unstagedCorpusFiles.has(file),
);

if (partiallyStagedCorpusFiles.length > 0) {
  console.error("Cannot regenerate LLM artifacts from partially staged corpus sources.");
  console.error("Stage or discard the unstaged changes in:");
  for (const file of partiallyStagedCorpusFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("LLM corpus source changed; regenerating llms.txt artifacts...");
runInherit("pnpm", ["llm:build"]);
runInherit("git", ["add", "llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"]);
