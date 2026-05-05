import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { prCommand, printNextCommands, reportCommand } from "./lib/next-commands.mjs";

const root = process.cwd();
const manifest = readJson("examples/examples-upgrade.config.json");

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    out: { type: "string" },
    "run-id": { type: "string" },
    "include-install": { type: "boolean", default: false },
    "include-env-sensitive": { type: "boolean", default: false },
    "include-playwright-install": { type: "boolean", default: false },
    "ci-parity": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
  },
});

const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? latestRunId(outRoot) ?? `validation-${timestamp()}`;
const outDir = join(root, outRoot, runId);
mkdirSync(outDir, { recursive: true });

const results = [];
for (const app of selectApps(values.example)) {
  const appResults = validateApp(app);
  results.push({ app: app.name, path: app.path, results: appResults });
  const appDir = join(outDir, app.name);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "validation.json"), `${JSON.stringify(appResults, null, 2)}\n`);
}

if (values["ci-parity"]) {
  const ciResults = validateCiParity();
  results.push({ app: "repo-ci-parity", path: ".", results: ciResults });
  writeFileSync(
    join(outDir, "ci-parity.validation.json"),
    `${JSON.stringify(ciResults, null, 2)}\n`,
  );
}

writeFileSync(
  join(outDir, "validation-index.json"),
  `${JSON.stringify({ schemaVersion: 1, runId, generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
);

const failed = results
  .flatMap((entry) => entry.results)
  .filter((result) => result.status === "failed");
console.log(`Validation report written to ${relative(root, outDir)}`);
if (!values.quiet) {
  printNextCommands("Next commands", [
    {
      label: "Generate consolidated report",
      command: reportCommand({ runId, example: values.example }),
    },
    failed.length === 0
      ? {
          label: "Open or update a draft PR after report generation",
          command: prCommand({ runId, allowProcessFiles: true }),
        }
      : null,
  ]);
}
if (failed.length > 0) {
  process.exitCode = 1;
}

function validateApp(app) {
  const validation = app.validation ?? {};
  const commands = [];
  if (values["include-install"]) {
    commands.push(...(validation.install ?? []).map((command) => ({ command, kind: "install" })));
  }
  if (values["include-playwright-install"] && validation.playwrightInstall) {
    commands.push({ command: validation.playwrightInstall, kind: "playwright-install" });
  }
  commands.push(...(validation.checks ?? []).map((command) => ({ command, kind: "check" })));
  for (const command of validation.envSensitiveChecks ?? []) {
    commands.push({
      command,
      kind: "env-sensitive",
      skipUnlessIncluded: !values["include-env-sensitive"],
    });
  }

  if (!existsSync(join(root, app.path))) {
    return [
      {
        command: null,
        kind: "preflight",
        status: "failed",
        message: `App path does not exist: ${app.path}`,
      },
    ];
  }

  return commands.map((entry) => {
    if (entry.skipUnlessIncluded) {
      return {
        command: entry.command,
        kind: entry.kind,
        status: "blocked-env",
        message: "Skipped because --include-env-sensitive was not provided.",
      };
    }
    return runCommand(entry.command, app.path, entry.kind);
  });
}

function validateCiParity() {
  const commands = [
    "pnpm build",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm format:check",
    "pnpm test:coverage",
    "pnpm api-report:check",
    "pnpm docs:build",
    "pnpm llm:check",
  ];
  return commands.map((command) => runCommand(command, ".", "ci-parity"));
}

function runCommand(command, cwd, kind) {
  if (values["dry-run"]) {
    return { command, cwd, kind, status: "skipped", message: "Dry run." };
  }
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd: join(root, cwd),
    shell: true,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    command,
    cwd,
    kind,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  };
}

function selectApps(example) {
  const apps = manifest.apps ?? [];
  if (example === "active") {
    return apps.filter((app) => app.status === "active");
  }
  const selected = apps.find((app) => app.name === example);
  if (!selected) {
    throw new Error(`Unknown example '${example}'.`);
  }
  if (selected.status !== "active") {
    throw new Error(`Example '${example}' has status '${selected.status}' and is not active.`);
  }
  return [selected];
}

function trimOutput(output) {
  const text = output?.trim() ?? "";
  return text.length > 12000 ? `${text.slice(0, 12000)}\n... truncated ...` : text;
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
