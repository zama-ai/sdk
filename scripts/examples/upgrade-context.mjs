import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { agentCommand, printNextCommands } from "./lib/next-commands.mjs";

const root = process.cwd();
const manifestPath = "examples/examples-upgrade.config.json";
const sourcesPath = "docs/agents/example-upgrade-sources.json";

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    target: { type: "string", default: "latest" },
    out: { type: "string" },
    "run-id": { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

const manifest = readJson(manifestPath);
const sources = readJson(sourcesPath);
const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? timestamp();
const outDir = join(root, outRoot, runId);
mkdirSync(outDir, { recursive: true });

const selectedApps = selectApps(values.example);
const packageMetadata = {
  "@zama-fhe/sdk": readJson("packages/sdk/package.json"),
  "@zama-fhe/react-sdk": readJson("packages/react-sdk/package.json"),
};

const reports = [];
for (const app of selectedApps) {
  const report = buildReport(app);
  reports.push(report);
  const appDir = join(outDir, app.name);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "context.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(appDir, "context.md"), renderMarkdown(report));
}

writeFileSync(
  join(outDir, "index.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      runId,
      target: values.target,
      apps: reports.map((report) => ({
        name: report.app.name,
        path: report.app.path,
        context: relative(root, join(outDir, report.app.name, "context.md")),
      })),
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${reports.length} context report(s) in ${relative(root, outDir)}`);
if (!values.quiet) {
  printNextCommands("Next commands", [
    {
      label: "Start implementing with Codex",
      command: agentCommand({ runId, example: values.example }),
    },
    {
      label: "Use the orchestrator next time",
      command: `pnpm examples:upgrade -- --mode prepare --example ${values.example} --target ${values.target}`,
    },
  ]);
}

function buildReport(app) {
  const packageJsonPath = join(app.path, "package.json");
  const packageJson = readJson(packageJsonPath);
  const sdkPackages = app.sdkPackages ?? manifest.defaults.sdkPackages;
  const currentVersions = {};
  const targetVersions = {};

  for (const packageName of sdkPackages) {
    currentVersions[packageName] = findDeclaredVersion(packageJson, packageName);
    targetVersions[packageName] = resolveTargetVersion(packageName, values.target);
  }

  const usageScan = scanUsage(app);
  const docs = recommendedDocs(app);
  const localFiles = listExisting([
    join(app.path, "package.json"),
    join(app.path, "package-lock.json"),
    join(app.path, "README.md"),
    join(app.path, "WALKTHROUGH.md"),
    join(app.path, "playwright.config.ts"),
    join(app.path, ".env.example"),
  ]);

  return {
    schemaVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    target: values.target,
    app: {
      name: app.name,
      path: app.path,
      status: app.status,
      stack: app.stack ?? [],
      packageManager: app.packageManager ?? manifest.defaults.packageManager,
      notes: app.notes ?? [],
    },
    packageVersions: {
      current: currentVersions,
      target: targetVersions,
      localRepository: Object.fromEntries(
        Object.entries(packageMetadata).map(([name, metadata]) => [name, metadata.version]),
      ),
    },
    scripts: packageJson.scripts ?? {},
    validation: app.validation ?? {},
    sources: {
      localFiles,
      changelog: extractChangelog(currentVersions, targetVersions),
      apiReports: listExisting(sources.sources.apiReports.files),
      officialDocs: listExisting(docs),
      ciWorkflows: listExisting(sources.sources.ciWorkflows.files),
    },
    usageScan,
    nextSteps: [
      "Read this context report and the listed source files.",
      "Write an impact plan before editing.",
      `Limit app changes to ${app.path}/** unless process files are explicitly in scope.`,
      "Run pnpm examples:upgrade:validate after changes.",
      "Generate pnpm examples:upgrade:report before final review.",
    ],
  };
}

function selectApps(example) {
  const manifestApps = manifest.apps ?? [];
  if (example === "active") {
    return manifestApps.filter((app) => app.status === "active");
  }
  if (example === "all") {
    return manifestApps.filter((app) => app.status !== "excluded");
  }
  const selected = manifestApps.find((app) => app.name === example);
  if (!selected) {
    throw new Error(`Unknown example '${example}'. See ${manifestPath}.`);
  }
  if (selected.status !== "active") {
    throw new Error(`Example '${example}' has status '${selected.status}' and is not active.`);
  }
  return [selected];
}

function resolveTargetVersion(packageName, target) {
  if (/^\d+\.\d+\.\d+/.test(target)) {
    return { version: target, source: "explicit" };
  }
  if (target === "local") {
    return { version: packageMetadata[packageName]?.version, source: "local-package-json" };
  }
  try {
    if (target === "highest") {
      const raw = npmView(packageName, "versions");
      const versions = JSON.parse(raw);
      return { version: versions.at(-1), source: "npm versions" };
    }
    const raw = npmView(packageName, `dist-tags.${target}`);
    return { version: JSON.parse(raw), source: `npm dist-tag ${target}` };
  } catch (error) {
    return {
      version: null,
      source: `npm ${target}`,
      error: error.message,
    };
  }
}

function npmView(packageName, field) {
  return execFileSync("npm", ["view", packageName, field, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  }).trim();
}

function findDeclaredVersion(packageJson, packageName) {
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    if (packageJson[section]?.[packageName]) {
      return { version: packageJson[section][packageName], section };
    }
  }
  return null;
}

function recommendedDocs(app) {
  const docs = new Set(sources.sources.officialDocs.common);
  for (const stackItem of app.stack ?? []) {
    for (const doc of sources.sources.officialDocs.byStack[stackItem] ?? []) {
      docs.add(doc);
    }
  }
  return [...docs];
}

function scanUsage(app) {
  const config = sources.sources.usageScan;
  const files = listFiles(join(root, app.path), config);
  const matches = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const matchedPatterns = config.patterns.filter((pattern) => line.includes(pattern));
      if (matchedPatterns.length > 0) {
        matches.push({
          file: relative(root, file),
          line: index + 1,
          patterns: matchedPatterns,
          text: line.trim(),
        });
      }
    });
  }
  return {
    patterns: config.patterns,
    matchCount: matches.length,
    matches,
  };
}

function listFiles(dir, config) {
  if (!existsSync(dir)) {
    return [];
  }
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!config.excludeDirs.includes(entry.name)) {
        results.push(...listFiles(path, config));
      }
      continue;
    }
    if (entry.isFile() && config.includeExtensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(path);
    }
  }
  return results;
}

function extractChangelog(currentVersions, targetVersions) {
  const path = join(root, "CHANGELOG.md");
  if (!existsSync(path)) {
    return { path: "CHANGELOG.md", excerpt: "", note: "CHANGELOG.md not found." };
  }
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const target = Object.values(targetVersions).find((entry) => entry?.version)?.version;
  const current = Object.values(currentVersions)
    .find((entry) => entry?.version)
    ?.version?.replace(/^[~^]/, "");
  const headings = lines
    .map((line, index) => ({ line, index, match: line.match(/^## \[([^\]]+)\]/) }))
    .filter((entry) => entry.match);
  const start =
    headings.find((entry) => entry.match[1] === target)?.index ?? headings[0]?.index ?? 0;
  const currentHeading = current ? headings.find((entry) => entry.match[1] === current) : null;
  const nextHeading = headings.find(
    (entry) => entry.index > start && entry.index <= (currentHeading?.index ?? Infinity),
  );
  const end = currentHeading?.index ?? nextHeading?.index ?? Math.min(lines.length, start + 220);
  return {
    path: "CHANGELOG.md",
    target,
    current,
    excerpt: lines.slice(start, end).join("\n").trim(),
    truncated: end < lines.length && end !== currentHeading?.index,
  };
}

function listExisting(paths) {
  return paths.filter((path) => existsSync(join(root, path)));
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function cliArgs() {
  return process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
}

function renderMarkdown(report) {
  const targetLines = Object.entries(report.packageVersions.target)
    .map(([name, result]) => {
      const suffix = result.error ? ` (unresolved: ${result.error})` : ` (${result.source})`;
      return `- ${name}: ${result.version ?? "unresolved"}${suffix}`;
    })
    .join("\n");
  const currentLines = Object.entries(report.packageVersions.current)
    .map(
      ([name, result]) =>
        `- ${name}: ${result?.version ?? "not declared"}${result?.section ? ` in ${result.section}` : ""}`,
    )
    .join("\n");
  const scripts = Object.entries(report.scripts)
    .map(([name, command]) => `- \`${name}\`: \`${String(command)}\``)
    .join("\n");
  const docs = report.sources.officialDocs.map((path) => `- ${path}`).join("\n");
  const apiReports = report.sources.apiReports.map((path) => `- ${path}`).join("\n");
  const localFiles = report.sources.localFiles.map((path) => `- ${path}`).join("\n");
  const usage = report.usageScan.matches
    .slice(0, 120)
    .map((match) => `- ${match.file}:${match.line} [${match.patterns.join(", ")}] ${match.text}`)
    .join("\n");

  return `# Example Upgrade Context: ${report.app.name}

Generated: ${report.generatedAt}

Run ID: \`${report.runId}\`

Target selector: \`${report.target}\`

## App

- Path: \`${report.app.path}\`
- Stack: ${report.app.stack.join(", ") || "unspecified"}
- Package manager: \`${report.app.packageManager}\`

## Current SDK Versions

${currentLines || "- None"}

## Target SDK Versions

${targetLines || "- None"}

## Scripts

${scripts || "- None"}

## Validation Plan

- Install: ${(report.validation.install ?? []).join(" && ") || "not configured"}
- Checks: ${(report.validation.checks ?? []).join(" && ") || "not configured"}
- Env-sensitive checks: ${(report.validation.envSensitiveChecks ?? []).join(" && ") || "none"}
- Playwright install: ${report.validation.playwrightInstall ?? "not configured"}

## Local Files

${localFiles || "- None"}

## Recommended Official Docs

${docs || "- None"}

## API Reports

${apiReports || "- None"}

## Changelog Excerpt

\`\`\`md
${report.sources.changelog.excerpt || "No changelog excerpt found."}
\`\`\`

## SDK Usage Scan

Matches: ${report.usageScan.matchCount}

${usage || "- No SDK-sensitive usage found."}

## Next Steps

${report.nextSteps.map((step) => `- ${step}`).join("\n")}
`;
}
