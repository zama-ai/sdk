import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const repoRoot = process.cwd();
export const docsRoot = join(repoRoot, "docs/gitbook/src");
export const includesRoot = join(repoRoot, "docs/gitbook/.gitbook/includes");

export const approvedExamples = [
  "example-hoodi",
  "node-ethers",
  "node-viem",
  "react-ethers",
  "react-viem",
  "react-wagmi",
];

export const excludedExamples = ["react-ledger"];

export const packageReadmes = [
  "README.md",
  "packages/sdk/README.md",
  "packages/react-sdk/README.md",
];

const packageReadmeTitles = new Map([
  ["README.md", "Repository README"],
  ["packages/sdk/README.md", "@zama-fhe/sdk"],
  ["packages/react-sdk/README.md", "@zama-fhe/react-sdk"],
]);

const packageReadmeDescriptions = new Map([
  [
    "README.md",
    "Monorepo overview, package layout, development workflow, and repository setup for the Zama SDK.",
  ],
  [
    "packages/sdk/README.md",
    "Core TypeScript SDK for confidential token operations, relayers, signer adapters, and low-level contract APIs.",
  ],
  [
    "packages/react-sdk/README.md",
    "React SDK with ZamaProvider, confidential token hooks, and TanStack Query integration on top of the core SDK.",
  ],
]);

export const apiReportGlobs = [
  "packages/sdk/etc/sdk.api.md",
  "packages/sdk/etc/sdk-ethers.api.md",
  "packages/sdk/etc/sdk-node.api.md",
  "packages/sdk/etc/sdk-query.api.md",
  "packages/sdk/etc/sdk-viem.api.md",
  "packages/react-sdk/etc/react-sdk.api.md",
  "packages/react-sdk/etc/react-sdk-wagmi.api.md",
];

function readUtf8(path) {
  return readFileSync(path, "utf8");
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {};
  }
  const meta = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    meta[key] = value;
  }
  return meta;
}

function extractTitle(content, fallbackTitle) {
  const stripped = stripFrontmatter(content);
  const titleMatch = stripped.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  return fallbackTitle;
}

function extractDescription(content) {
  const frontmatter = parseFrontmatter(content);
  if (frontmatter.description) {
    return frontmatter.description;
  }

  const stripped = stripFrontmatter(content)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{%\s*include\s*"[^"]+"\s*%\}/g, "")
    .replace(
      /\{%\s*tabs\s*%\}|{%\s*endtabs\s*%\}|{%\s*tab\s+title="[^"]+"\s*%\}|{%\s*endtab\s*%\}/g,
      "",
    )
    .replace(/\{%\s*hint\s+style="[^"]+"\s*%\}|{%\s*endhint\s*%\}/g, "")
    .trim();

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !block.startsWith("#"))
    .filter((block) => !block.startsWith("```"));

  const candidates = paragraphs.map((block) => ({
    original: block,
    normalized: block
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }));

  const preferred =
    candidates.find(
      ({ original, normalized }) =>
        normalized.length > 20 && !/^\s*[-*|>]/.test(original) && !/^\s*\d+\./.test(original),
    ) ?? candidates.find(({ normalized }) => normalized.length > 20);

  let description = preferred?.normalized.replace(/:\s*$/, "") ?? "";
  if (!/[.!?]$/.test(description)) {
    const lastSentenceEnd = Math.max(
      description.lastIndexOf("."),
      description.lastIndexOf("!"),
      description.lastIndexOf("?"),
    );
    if (lastSentenceEnd > 0) {
      description = description.slice(0, lastSentenceEnd + 1).trim();
    }
  }

  return description;
}

function titleFromFileName(fileName) {
  return fileName
    .replace(/[-_]/g, " ")
    .replace(/\.md$/i, "")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseSummary() {
  const summaryPath = join(docsRoot, "SUMMARY.md");
  const lines = readUtf8(summaryPath).split("\n");
  const entries = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)-?\s*\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) {
      continue;
    }
    const [, indent, title, link] = match;
    if (!link.endsWith(".md")) {
      continue;
    }
    if (link === "SUMMARY.md") {
      continue;
    }
    entries.push({
      title,
      logicalPath: link.replace(/\.md$/, ""),
      sourcePath: join("docs/gitbook/src", link),
      depth: Math.floor(indent.length / 2),
    });
  }

  return entries;
}

export function getExampleDocs(exampleName) {
  const exampleDir = join(repoRoot, "examples", exampleName);
  const candidates = ["README.md", "WALKTHROUGH.md"];

  return candidates
    .map((fileName) => join(exampleDir, fileName))
    .filter((path) => existsSync(path))
    .map((path) => ({
      sourcePath: relative(repoRoot, path),
      logicalPath: `examples/${exampleName}/${path.split("/").pop().replace(/\.md$/, "").toLowerCase()}`,
      fileName: path.split("/").pop(),
    }));
}

export function buildCorpusManifest() {
  const summaryEntries = parseSummary();
  const docsEntries = summaryEntries.map((entry) => {
    const absolutePath = join(repoRoot, entry.sourcePath);
    const content = readUtf8(absolutePath);
    return {
      id: `doc:${entry.logicalPath}`,
      title: extractTitle(content, entry.title),
      source_path: entry.sourcePath,
      source_type: "official-doc",
      category: categoryFromLogicalPath(entry.logicalPath),
      logical_path: entry.logicalPath,
      description: extractDescription(content),
      include_in_llms_txt: true,
      include_in_llms_full: true,
    };
  });

  const exampleEntries = approvedExamples.flatMap((exampleName) =>
    getExampleDocs(exampleName).map((entry) => {
      const absolutePath = join(repoRoot, entry.sourcePath);
      const content = readUtf8(absolutePath);
      return {
        id: `example:${entry.logicalPath}`,
        title: `${exampleName} ${entry.fileName.replace(/\.md$/, "")}`,
        source_path: entry.sourcePath,
        source_type: "official-example",
        category: "examples",
        logical_path: entry.logicalPath,
        description: extractDescription(content),
        include_in_llms_txt: true,
        include_in_llms_full: true,
      };
    }),
  );

  const readmeEntries = packageReadmes.map((sourcePath) => {
    const absolutePath = join(repoRoot, sourcePath);
    const content = readUtf8(absolutePath);
    return {
      id: `readme:${sourcePath.replace(/[/.]/g, "_")}`,
      title:
        packageReadmeTitles.get(sourcePath) ??
        extractTitle(content, titleFromFileName(sourcePath.split("/").pop())),
      source_path: sourcePath,
      source_type: "package-readme",
      category: "package-readmes",
      logical_path: sourcePath.replace(/\.md$/, ""),
      description: packageReadmeDescriptions.get(sourcePath) ?? extractDescription(content),
      include_in_llms_txt: true,
      include_in_llms_full: true,
    };
  });

  const apiEntries = apiReportGlobs
    .filter((sourcePath) => existsSync(join(repoRoot, sourcePath)))
    .map((sourcePath) => {
      const content = readUtf8(join(repoRoot, sourcePath));
      return {
        id: `api:${sourcePath.replace(/[/.]/g, "_")}`,
        title: extractTitle(content, titleFromFileName(sourcePath.split("/").pop())),
        source_path: sourcePath,
        source_type: "api-report",
        category: "api-reports",
        logical_path: sourcePath.replace(/\.md$/, ""),
        description: extractDescription(content),
        include_in_llms_txt: false,
        include_in_llms_full: false,
      };
    });

  return {
    schema_version: 1,
    approved_examples: approvedExamples,
    excluded_examples: excludedExamples,
    entries: [...docsEntries, ...exampleEntries, ...readmeEntries, ...apiEntries],
  };
}

export function loadGitbookSource(sourcePath) {
  const absolutePath = join(repoRoot, sourcePath);
  return readUtf8(absolutePath);
}

export function resolveIncludes(content, currentSourcePath) {
  return content.replace(/\{%\s*include\s*"([^"]+)"\s*%\}/g, (_match, includePath) => {
    const candidatePath = join(repoRoot, includePath);
    const fallbackPath = join(dirname(join(repoRoot, currentSourcePath)), includePath);
    const resolved = existsSync(candidatePath) ? candidatePath : fallbackPath;
    if (!existsSync(resolved)) {
      return `\n> [!NOTE]\n> Missing include: ${includePath}\n`;
    }
    const includedSourcePath = relative(repoRoot, resolved);
    return resolveIncludes(readUtf8(resolved), includedSourcePath);
  });
}

export function renderHints(content) {
  return content.replace(
    /\{%\s*hint\s+style="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/g,
    (_match, style, body) => {
      const labelMap = {
        info: "INFO",
        warning: "WARNING",
        danger: "DANGER",
        success: "SUCCESS",
      };
      const label = labelMap[style] ?? "NOTE";
      const lines = body
        .trim()
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n");
      return `\n> [!${label}]\n${lines}\n`;
    },
  );
}

export function renderTabs(content) {
  return content.replace(/\{%\s*tabs\s*%\}([\s\S]*?)\{%\s*endtabs\s*%\}/g, (_match, inner) => {
    const tabRegex = /\{%\s*tab\s+title="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endtab\s*%\}/g;
    const sections = [];
    let tabMatch;
    while ((tabMatch = tabRegex.exec(inner)) !== null) {
      sections.push(`### Tab: ${tabMatch[1]}\n\n${tabMatch[2].trim()}`);
    }
    return `\n${sections.join("\n\n")}\n`;
  });
}

export function normalizeLinks(content) {
  return content.replace(/\]\(\/([^)]+)\)/g, (_match, path) => {
    const [pathPart, ...rest] = path.split("#");
    const anchor = rest.length > 0 ? `#${rest.join("#")}` : "";
    return `](docs/gitbook/src/${pathPart.replace(/\.md$/, "")}.md${anchor})`;
  });
}

export function normalizeGitbookMarkdown(sourcePath, content) {
  let result = content;
  result = stripFrontmatter(result);
  result = resolveIncludes(result, sourcePath);
  result = renderHints(result);
  result = renderTabs(result);
  result = normalizeLinks(result);
  return result.trim();
}

export function categoryFromLogicalPath(logicalPath) {
  if (logicalPath.startsWith("tutorials/")) {
    return "tutorials";
  }
  if (logicalPath.startsWith("guides/")) {
    return "guides";
  }
  if (logicalPath.startsWith("reference/sdk/")) {
    return "reference-sdk";
  }
  if (logicalPath.startsWith("reference/react/")) {
    return "reference-react";
  }
  if (logicalPath.startsWith("concepts/")) {
    return "concepts";
  }
  if (logicalPath === "README") {
    return "introduction";
  }
  return "docs";
}

export function readManifestEntriesByType(manifest, sourceType) {
  return manifest.entries.filter((entry) => entry.source_type === sourceType);
}
