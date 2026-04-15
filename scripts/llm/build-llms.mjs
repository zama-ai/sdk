import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvedExamples,
  buildCorpusManifest,
  loadGitbookSource,
  normalizeGitbookMarkdown,
  repoRoot,
} from "./lib/corpus.mjs";

function loadManifest() {
  const manifestPath = join(repoRoot, "docs/llm/corpus-manifest.json");
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return buildCorpusManifest();
  }
}

function formatIndexSection(title, entries) {
  const lines = [`## ${title}`, ""];
  for (const entry of entries) {
    lines.push(`- [${entry.title}](${rawGithubUrl(entry.source_path)}): ${entry.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatGroupedDocsSection(entries) {
  const sections = [
    { title: "Introduction", categories: ["introduction"] },
    { title: "Getting Started", categories: ["tutorials"] },
    { title: "Guides", categories: ["guides"] },
    { title: "SDK Reference", categories: ["reference-sdk"] },
    { title: "React Reference", categories: ["reference-react"] },
    { title: "Concepts", categories: ["concepts"] },
  ];

  const lines = ["## Official Documentation", ""];
  for (const section of sections) {
    const group = entries.filter((entry) => section.categories.includes(entry.category));
    if (group.length === 0) {
      continue;
    }
    lines.push(`### ${section.title}`, "");
    for (const entry of group) {
      lines.push(`- [${entry.title}](${rawGithubUrl(entry.source_path)}): ${entry.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function rawGithubUrl(sourcePath) {
  return `https://raw.githubusercontent.com/zama-ai/sdk/main/${sourcePath}`;
}

function buildLlmsTxt(manifest) {
  const docs = manifest.entries.filter(
    (entry) => entry.source_type === "official-doc" && entry.include_in_llms_txt,
  );
  const examples = manifest.entries.filter(
    (entry) => entry.source_type === "official-example" && entry.include_in_llms_txt,
  );
  const readmes = manifest.entries.filter(
    (entry) => entry.source_type === "package-readme" && entry.include_in_llms_txt,
  );

  return [
    "# Zama SDK",
    "",
    "Zama SDK is a TypeScript and React SDK for confidential token flows and confidential smart contract interactions on EVM-compatible chains.",
    "",
    "Source of truth: official documentation, approved official examples, and package READMEs. API reports are fallback reference material and are intentionally excluded from this index.",
    "",
    "Use this file for discovery. Follow the links to fetch the smallest source that answers the task. Start with the official docs, then move to the approved examples that match the target stack.",
    "",
    formatGroupedDocsSection(docs).trimEnd(),
    "",
    formatIndexSection("Official Examples", examples).trimEnd(),
    "",
    formatIndexSection("Package READMEs", readmes).trimEnd(),
  ].join("\n");
}

function buildEntryBlock(entry, content) {
  return [
    `## ${entry.title}`,
    "",
    `- source_type: ${entry.source_type}`,
    `- source_path: ${entry.source_path}`,
    `- logical_path: ${entry.logical_path}`,
    "",
    content.trim(),
    "",
  ].join("\n");
}

function buildLlmsFull(manifest) {
  const docs = manifest.entries.filter(
    (entry) => entry.source_type === "official-doc" && entry.include_in_llms_full,
  );
  const examples = manifest.entries.filter(
    (entry) => entry.source_type === "official-example" && entry.include_in_llms_full,
  );
  const readmes = manifest.entries.filter(
    (entry) => entry.source_type === "package-readme" && entry.include_in_llms_full,
  );

  const sections = [
    "# Zama SDK",
    "",
    "Zama SDK is a TypeScript and React SDK for confidential token flows and confidential smart contract interactions on EVM-compatible chains.",
    "",
    "Use `llms.txt` for discovery when you do not need the full corpus.",
    "",
    "Source of truth:",
    "",
    "1. Official documentation in `docs/gitbook/src`",
    "2. Approved official examples",
    "3. Package READMEs for onboarding context",
    "",
    "API reports are intentionally excluded from this file. They remain available in the repository as fallback reference material.",
    "",
    "## Official Documentation",
    "",
  ];

  for (const entry of docs) {
    sections.push(
      buildEntryBlock(
        entry,
        normalizeGitbookMarkdown(entry.source_path, loadGitbookSource(entry.source_path)),
      ),
    );
  }

  sections.push("## Official Examples", "");
  for (const entry of examples) {
    const content = readFileSync(join(repoRoot, entry.source_path), "utf8").trim();
    sections.push(buildEntryBlock(entry, content));
  }

  sections.push("## Package READMEs", "");
  for (const entry of readmes) {
    const content = readFileSync(join(repoRoot, entry.source_path), "utf8").trim();
    sections.push(buildEntryBlock(entry, content));
  }

  return sections.join("\n");
}

const manifest = loadManifest();
mkdirSync(repoRoot, { recursive: true });
writeFileSync(join(repoRoot, "llms.txt"), cleanGeneratedMarkdown(buildLlmsTxt(manifest)));
writeFileSync(join(repoRoot, "llms-full.txt"), cleanGeneratedMarkdown(buildLlmsFull(manifest)));

console.log(`Wrote llms.txt and llms-full.txt for ${approvedExamples.length} approved examples.`);

function cleanGeneratedMarkdown(content) {
  return `${content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
}
