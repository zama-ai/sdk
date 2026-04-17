import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join, posix, relative } from "node:path";

export const repoRoot = process.cwd();
export const corpusConfigPath = "docs/llm/corpus.config.json";
export const corpusConfig = loadCorpusConfig();
export const rawGithubBaseUrl = corpusConfig.rawGithubBaseUrl.replace(/\/$/u, "");
export const docsRoot = join(repoRoot, corpusConfig.docs.root);
export const docsSummaryPath = join(repoRoot, corpusConfig.docs.summary);
export const includesRoot = join(repoRoot, "docs/gitbook/.gitbook/includes");

export const approvedExamples = corpusConfig.examples.approved;
export const excludedExamples = corpusConfig.examples.excluded;
export const exampleDocFiles = corpusConfig.examples.docFiles;
export const packageReadmes = corpusConfig.readmes.map((entry) => entry.path);
export const apiReportGlobs = corpusConfig.apiReports;
export const forbiddenPaths = corpusConfig.forbiddenPaths;

const packageReadmeTitles = new Map(corpusConfig.readmes.map((entry) => [entry.path, entry.title]));
const packageReadmeDescriptions = new Map(
  corpusConfig.readmes.map((entry) => [entry.path, entry.description]),
);

function loadCorpusConfig() {
  const config = JSON.parse(readFileSync(join(repoRoot, corpusConfigPath), "utf8"));
  validateCorpusConfig(config);
  return config;
}

function validateCorpusConfig(config) {
  const errors = [];
  if (config.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (!isNonEmptyString(config.rawGithubBaseUrl)) {
    errors.push("rawGithubBaseUrl must be a non-empty string");
  }
  if (!isNonEmptyString(config.docs?.root)) {
    errors.push("docs.root must be a non-empty string");
  }
  if (!isNonEmptyString(config.docs?.summary)) {
    errors.push("docs.summary must be a non-empty string");
  }
  validateStringArray(config.examples?.approved, "examples.approved", errors);
  validateStringArray(config.examples?.excluded, "examples.excluded", errors);
  validateStringArray(config.examples?.docFiles, "examples.docFiles", errors);
  validateStringArray(config.apiReports, "apiReports", errors);
  validateStringArray(config.forbiddenPaths, "forbiddenPaths", errors);
  if (!Array.isArray(config.readmes) || config.readmes.length === 0) {
    errors.push("readmes must be a non-empty array");
  } else {
    for (const [index, readme] of config.readmes.entries()) {
      if (!isNonEmptyString(readme.path)) {
        errors.push(`readmes[${index}].path must be a non-empty string`);
      }
      if (!isNonEmptyString(readme.title)) {
        errors.push(`readmes[${index}].title must be a non-empty string`);
      }
      if (!isNonEmptyString(readme.description)) {
        errors.push(`readmes[${index}].description must be a non-empty string`);
      }
    }
  }

  const approved = new Set(config.examples?.approved ?? []);
  for (const excluded of config.examples?.excluded ?? []) {
    if (approved.has(excluded)) {
      errors.push(`example "${excluded}" cannot be both approved and excluded`);
    }
  }

  for (const path of [
    config.docs?.root,
    config.docs?.summary,
    ...(config.examples?.docFiles ?? []),
    ...(config.apiReports ?? []),
    ...(config.forbiddenPaths ?? []),
    ...(config.readmes ?? []).map((entry) => entry.path),
  ]) {
    if (isNonEmptyString(path) && isUnsafeRelativePath(path)) {
      errors.push(`unsafe relative path in corpus config: ${path}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ${corpusConfigPath}:\n- ${errors.join("\n- ")}`);
  }
}

function validateStringArray(value, fieldName, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${fieldName} must be a non-empty array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isNonEmptyString(item)) {
      errors.push(`${fieldName}[${index}] must be a non-empty string`);
    }
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isUnsafeRelativePath(path) {
  return path.startsWith("/") || path.includes("..");
}

function readUtf8(path) {
  return readFileSync(path, "utf8");
}

export function rawGithubUrl(sourcePath) {
  return `${rawGithubBaseUrl}/${sourcePath}`;
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
  const lines = readUtf8(docsSummaryPath).split("\n");
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
      sourcePath: join(corpusConfig.docs.root, link),
      depth: Math.floor(indent.length / 2),
    });
  }

  return entries;
}

export function getExampleDocs(exampleName) {
  const exampleDir = join(repoRoot, "examples", exampleName);

  return exampleDocFiles
    .map((fileName) => join(exampleDir, fileName))
    .filter((path) => existsSync(path))
    .map((path) => ({
      sourcePath: relative(repoRoot, path),
      logicalPath: `examples/${exampleName}/${basename(path).replace(/\.md$/, "").toLowerCase()}`,
      fileName: basename(path),
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
      source_url: rawGithubUrl(entry.sourcePath),
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
        source_url: rawGithubUrl(entry.sourcePath),
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
      source_url: rawGithubUrl(sourcePath),
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
        source_url: rawGithubUrl(sourcePath),
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
    config_path: corpusConfigPath,
    raw_github_base_url: rawGithubBaseUrl,
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

function normalizeMarkdownLinkTarget(target, currentSourcePath) {
  if (!target || target.startsWith("#") || /^(?:https?:|mailto:|tel:)/u.test(target)) {
    return target;
  }

  const [pathPart, ...rest] = target.split("#");
  const anchor = rest.length > 0 ? `#${rest.join("#")}` : "";
  const hasNonMarkdownExtension = /\.[a-z0-9]+$/iu.test(pathPart) && !pathPart.endsWith(".md");
  if (hasNonMarkdownExtension) {
    return target;
  }
  if (!pathPart.endsWith(".md") && !pathPart.startsWith("/")) {
    return target;
  }

  let sourcePath;
  if (pathPart.startsWith("/")) {
    const withoutSlash = pathPart.slice(1);
    sourcePath = `${corpusConfig.docs.root}/${withoutSlash.replace(/\.md$/u, "")}.md`;
  } else if (
    pathPart.startsWith(corpusConfig.docs.root) ||
    pathPart.startsWith("examples/") ||
    pathPart.startsWith("packages/") ||
    pathPart === "README.md"
  ) {
    sourcePath = pathPart;
  } else {
    sourcePath = posix.normalize(posix.join(posix.dirname(currentSourcePath), pathPart));
  }

  return `${rawGithubUrl(sourcePath)}${anchor}`;
}

export function normalizeLinks(content, currentSourcePath) {
  return content.replace(/\]\(([^)]+)\)/g, (match, target) => {
    return `](${normalizeMarkdownLinkTarget(target, currentSourcePath)})`;
  });
}

export function normalizeGitbookMarkdown(sourcePath, content) {
  let result = content;
  result = stripFrontmatter(result);
  result = resolveIncludes(result, sourcePath);
  result = renderHints(result);
  result = renderTabs(result);
  result = normalizeLinks(result, sourcePath);
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
