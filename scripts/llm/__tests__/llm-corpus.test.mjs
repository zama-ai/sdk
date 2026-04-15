import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  apiReportGlobs,
  approvedExamples,
  buildCorpusManifest,
  corpusConfig,
  docsSummaryPath,
  excludedExamples,
  forbiddenPaths,
  parseSummary,
  rawGithubBaseUrl,
  repoRoot,
} from "../lib/corpus.mjs";
import { buildLlmsFull, buildLlmsTxt, cleanGeneratedMarkdown } from "../build-llms.mjs";

const manifest = buildCorpusManifest();

function entriesBySourceType(sourceType) {
  return manifest.entries.filter((entry) => entry.source_type === sourceType);
}

describe("LLM corpus config", () => {
  test("points at existing source roots and keeps approved/excluded examples disjoint", () => {
    expect(rawGithubBaseUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/zama-ai\/sdk\//u);
    expect(existsSync(docsSummaryPath)).toBe(true);

    const excluded = new Set(excludedExamples);
    for (const exampleName of approvedExamples) {
      expect(excluded.has(exampleName)).toBe(false);
      expect(existsSync(join(repoRoot, "examples", exampleName))).toBe(true);
    }

    for (const readme of corpusConfig.readmes) {
      expect(existsSync(join(repoRoot, readme.path))).toBe(true);
      expect(readme.title.length).toBeGreaterThan(0);
      expect(readme.description.length).toBeGreaterThan(0);
    }
  });

  test("keeps API reports as fallback-only sources", () => {
    for (const sourcePath of apiReportGlobs) {
      expect(existsSync(join(repoRoot, sourcePath))).toBe(true);
    }

    for (const entry of entriesBySourceType("api-report")) {
      expect(entry.include_in_llms_txt).toBe(false);
      expect(entry.include_in_llms_full).toBe(false);
    }
  });
});

describe("LLM corpus manifest", () => {
  test("includes every published docs page from SUMMARY.md", () => {
    const summaryEntries = parseSummary();
    const docsEntries = entriesBySourceType("official-doc");

    expect(docsEntries).toHaveLength(summaryEntries.length);
    expect(docsEntries.map((entry) => entry.source_path)).toContain(
      "docs/gitbook/src/guides/build-with-an-llm.md",
    );
  });

  test("includes approved example docs and excludes explicitly rejected examples", () => {
    const sourcePaths = manifest.entries.map((entry) => entry.source_path);

    for (const exampleName of approvedExamples) {
      for (const fileName of corpusConfig.examples.docFiles) {
        const sourcePath = `examples/${exampleName}/${fileName}`;
        if (existsSync(join(repoRoot, sourcePath))) {
          expect(sourcePaths).toContain(sourcePath);
        }
      }
    }

    for (const exampleName of excludedExamples) {
      expect(
        sourcePaths.some((sourcePath) => sourcePath.startsWith(`examples/${exampleName}/`)),
      ).toBe(false);
    }
  });

  test("does not include forbidden paths", () => {
    for (const entry of manifest.entries) {
      for (const forbiddenPath of forbiddenPaths) {
        expect(entry.source_path.startsWith(forbiddenPath)).toBe(false);
      }
    }
  });

  test("is deterministic", () => {
    expect(JSON.stringify(buildCorpusManifest())).toBe(JSON.stringify(buildCorpusManifest()));
  });
});

describe("LLM artifact rendering", () => {
  test("renders llms.txt as a raw GitHub URL index", () => {
    const llms = buildLlmsTxt(manifest);

    expect(llms).toContain("# Zama SDK");
    expect(llms).toContain(`${rawGithubBaseUrl}/docs/gitbook/src/guides/build-with-an-llm.md`);
    expect(llms).toContain(`${rawGithubBaseUrl}/examples/react-wagmi/WALKTHROUGH.md`);
    expect(llms).not.toContain("packages/sdk/etc/sdk.api.md");
    expect(llms).not.toContain("examples/react-ledger");
  });

  test("renders llms-full.txt with source metadata and large-context guidance", () => {
    const llmsFull = cleanGeneratedMarkdown(buildLlmsFull(manifest));

    expect(llmsFull).toContain("Only use it with agents that support large context windows");
    expect(llmsFull).toContain("source_path: docs/gitbook/src/guides/configuration.md");
    expect(llmsFull).toContain("source_path: examples/react-wagmi/WALKTHROUGH.md");
    expect(llmsFull).not.toContain("source_path: packages/sdk/etc/sdk.api.md");
    expect(llmsFull).not.toContain("source_path: examples/react-ledger");
    expect(llmsFull.split("\n").some((line) => /\s$/u.test(line))).toBe(false);
  });

  test("generated files match renderer output", () => {
    expect(readFileSync(join(repoRoot, "llms.txt"), "utf8")).toBe(
      cleanGeneratedMarkdown(buildLlmsTxt(manifest)),
    );
    expect(readFileSync(join(repoRoot, "llms-full.txt"), "utf8")).toBe(
      cleanGeneratedMarkdown(buildLlmsFull(manifest)),
    );
  });
});
