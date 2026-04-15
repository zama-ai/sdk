import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approvedExamples, buildCorpusManifest, repoRoot } from "./lib/corpus.mjs";

const manifest = buildCorpusManifest();
const llms = readFileSync(join(repoRoot, "llms.txt"), "utf8");
const llmsFull = readFileSync(join(repoRoot, "llms-full.txt"), "utf8");

const missing = [];

for (const entry of manifest.entries.filter((item) => item.source_type === "official-doc")) {
  if (!llms.includes(`https://raw.githubusercontent.com/zama-ai/sdk/main/${entry.source_path}`)) {
    missing.push(`llms.txt missing doc raw URL: ${entry.source_path}`);
  }
  if (!llmsFull.includes(`source_path: ${entry.source_path}`)) {
    missing.push(`llms-full.txt missing doc source path: ${entry.source_path}`);
  }
}

for (const exampleName of approvedExamples) {
  if (!llms.includes(`examples/${exampleName}`)) {
    missing.push(`llms.txt missing approved example: ${exampleName}`);
  }
  if (!llmsFull.includes(`examples/${exampleName}`)) {
    missing.push(`llms-full.txt missing approved example: ${exampleName}`);
  }
}

for (const forbiddenPath of [
  "examples/react-ledger",
  "docs/gitbook/build",
  "docs/gitbook/book",
  "node_modules",
]) {
  if (llms.includes(`source_path: ${forbiddenPath}`) || llms.includes(`(${forbiddenPath}`)) {
    missing.push(`llms.txt contains excluded source path: ${forbiddenPath}`);
  }
  if (
    llmsFull.includes(`source_path: ${forbiddenPath}`) ||
    llmsFull.includes(`(${forbiddenPath}`)
  ) {
    missing.push(`llms-full.txt contains excluded source path: ${forbiddenPath}`);
  }
}

if (missing.length > 0) {
  console.error("LLM artifact validation failed:");
  for (const issue of missing) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("LLM artifact validation passed.");
