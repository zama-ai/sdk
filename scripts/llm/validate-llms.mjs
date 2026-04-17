import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvedExamples,
  buildCorpusManifest,
  forbiddenPaths,
  rawGithubUrl,
  repoRoot,
} from "./lib/corpus.mjs";

const manifest = buildCorpusManifest();
const llms = readFileSync(join(repoRoot, "llms.txt"), "utf8");
const llmsFull = readFileSync(join(repoRoot, "llms-full.txt"), "utf8");

const missing = [];

for (const entry of manifest.entries.filter((item) => item.include_in_llms_txt)) {
  if (!llms.includes(entry.source_url ?? rawGithubUrl(entry.source_path))) {
    missing.push(`llms.txt missing raw URL: ${entry.source_path}`);
  }
}

for (const entry of manifest.entries.filter((item) => item.include_in_llms_full)) {
  if (!llmsFull.includes(`source_path: ${entry.source_path}`)) {
    missing.push(`llms-full.txt missing source path: ${entry.source_path}`);
  }
  if (!llmsFull.includes(`source_url: ${entry.source_url ?? rawGithubUrl(entry.source_path)}`)) {
    missing.push(`llms-full.txt missing source URL: ${entry.source_path}`);
  }
}

for (const entry of manifest.entries.filter((item) => !item.include_in_llms_txt)) {
  if (llms.includes(entry.source_url ?? rawGithubUrl(entry.source_path))) {
    missing.push(`llms.txt contains excluded entry: ${entry.source_path}`);
  }
}

for (const entry of manifest.entries.filter((item) => !item.include_in_llms_full)) {
  if (llmsFull.includes(`source_path: ${entry.source_path}`)) {
    missing.push(`llms-full.txt contains excluded entry: ${entry.source_path}`);
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

for (const forbiddenPath of forbiddenPaths) {
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

if (!llmsFull.includes("Only use it with agents that support large context windows")) {
  missing.push("llms-full.txt missing large context window guidance");
}

if (missing.length > 0) {
  console.error("LLM artifact validation failed:");
  for (const issue of missing) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("LLM artifact validation passed.");
