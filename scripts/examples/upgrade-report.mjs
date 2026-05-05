import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { prCommand, printNextCommands, verifyCommand } from "./lib/next-commands.mjs";

const root = process.cwd();
const manifest = readJson("examples/examples-upgrade.config.json");

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    out: { type: "string" },
    "run-id": { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? latestRunId(outRoot);
if (!runId) {
  throw new Error(`No generated run found under ${outRoot}. Run examples:upgrade:context first.`);
}

const outDir = join(root, outRoot, runId);
mkdirSync(outDir, { recursive: true });

const selectedApps = selectApps(values.example);
const sections = selectedApps.map((app) => renderAppReport(app, runId)).join("\n\n");
const body = `# Example Upgrade Report

Run ID: \`${runId}\`

Generated: ${new Date().toISOString()}

${sections}
`;

writeFileSync(join(outDir, "report.md"), body);
console.log(`Report written to ${relative(root, join(outDir, "report.md"))}`);
if (!values.quiet) {
  printNextCommands("Next commands", [
    {
      label: "Open or update a draft PR",
      command: prCommand({ runId, allowProcessFiles: true }),
    },
    {
      label: "Re-run verification",
      command: verifyCommand({ runId, example: values.example }),
    },
  ]);
}

function renderAppReport(app, reportRunId) {
  const appDir = join(root, outRoot, reportRunId, app.name);
  const context = readOptionalJson(join(appDir, "context.json"));
  const validation = readOptionalJson(join(appDir, "validation.json"));
  const changedFiles = gitChangedFiles(app.path);
  const current = context?.packageVersions.current ?? {};
  const target = context?.packageVersions.target ?? {};
  const validationLines = validation
    ? validation.map(
        (entry) =>
          `- ${entry.status}: \`${entry.command ?? entry.kind}\`${entry.message ? ` - ${entry.message}` : ""}`,
      )
    : ["- No validation results found for this run."];

  return `## ${app.name}

- Path: \`${app.path}\`
- Stack: ${(app.stack ?? []).join(", ") || "unspecified"}

### SDK Versions

${
  Object.keys({ ...current, ...target })
    .map((name) => {
      const from = current[name]?.version ?? "not declared";
      const to = target[name]?.version ?? "unresolved";
      return `- ${name}: ${from} -> ${to}`;
    })
    .join("\n") || "- No SDK packages tracked."
}

### Changed Files

${changedFiles.map((file) => `- ${file}`).join("\n") || "- No changed files under this app."}

### Validation

${validationLines.join("\n")}

### Manual Checklist

Use \`docs/agents/example-upgrade-checklist.md\`. Mark any item that cannot apply to this app as not applicable during review.

### Risks

- Confirm README/WALKTHROUGH still match the upgraded behavior.
- Confirm any env-sensitive checks that were blocked locally before merging.
`;
}

function gitChangedFiles(path) {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "--", path], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return output ? output.split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

function selectApps(example) {
  const manifestApps = manifest.apps ?? [];
  if (example === "active") {
    return manifestApps.filter((app) => app.status === "active");
  }
  const selected = manifestApps.find((app) => app.name === example);
  if (!selected) {
    throw new Error(`Unknown example '${example}'.`);
  }
  if (selected.status !== "active") {
    throw new Error(`Example '${example}' has status '${selected.status}' and is not active.`);
  }
  return [selected];
}

function latestRunId(reportRoot) {
  const dir = join(root, reportRoot);
  if (!existsSync(dir)) {
    return null;
  }
  return readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name) }))
    .filter((entry) => statSync(entry.path).isDirectory())
    .toSorted((a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs)[0]?.name;
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function readOptionalJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function cliArgs() {
  return process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
}
