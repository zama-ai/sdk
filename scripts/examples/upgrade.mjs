import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { agentCommand, prCommand, printNextCommands, verifyCommand } from "./lib/next-commands.mjs";

const root = process.cwd();
const manifest = readJson("examples/examples-upgrade.config.json");

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    target: { type: "string", default: "latest" },
    mode: { type: "string", default: "prepare" },
    out: { type: "string" },
    "run-id": { type: "string" },
    "include-install": { type: "boolean", default: false },
    "include-env-sensitive": { type: "boolean", default: false },
    "include-playwright-install": { type: "boolean", default: false },
    "ci-parity": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? `upgrade-${timestamp()}`;
const outDir = join(root, outRoot, runId);
mkdirSync(outDir, { recursive: true });

const mode = values.mode;
const validModes = new Set(["prepare", "verify", "full"]);
if (!validModes.has(mode)) {
  throw new Error(`Unsupported mode '${mode}'. Use prepare, verify, or full.`);
}

if (mode === "prepare" || mode === "full") {
  run("node", [
    "scripts/examples/upgrade-context.mjs",
    "--example",
    values.example,
    "--target",
    values.target,
    "--run-id",
    runId,
    "--out",
    outRoot,
    "--quiet",
  ]);
  writeAgentTask();
}

if (mode === "verify" || mode === "full") {
  const validateArgs = [
    "scripts/examples/upgrade-validate.mjs",
    "--example",
    values.example,
    "--run-id",
    runId,
    "--out",
    outRoot,
    "--quiet",
  ];
  addBooleanFlag(validateArgs, "include-install", values["include-install"]);
  addBooleanFlag(validateArgs, "include-env-sensitive", values["include-env-sensitive"]);
  addBooleanFlag(validateArgs, "include-playwright-install", values["include-playwright-install"]);
  addBooleanFlag(validateArgs, "ci-parity", values["ci-parity"]);
  addBooleanFlag(validateArgs, "dry-run", values["dry-run"]);
  run("node", validateArgs);

  run("node", [
    "scripts/examples/upgrade-report.mjs",
    "--example",
    values.example,
    "--run-id",
    runId,
    "--out",
    outRoot,
    "--quiet",
  ]);
}

console.log(`Example upgrade ${mode} run '${runId}' written to ${relative(root, outDir)}`);
printUpgradeNextCommands();

function writeAgentTask() {
  const indexPath = join(outDir, "index.json");
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : null;
  const contextList =
    index?.apps?.map((app) => `- ${app.name}: ${app.context}`).join("\n") ??
    "- No context index found.";
  const body = `# Agent Task: Upgrade SDK Examples

Run ID: \`${runId}\`

Target: \`${values.target}\`

Scope: \`${values.example}\`

## Required Inputs

Read \`docs/agents/example-upgrade.md\` before editing.

Read these generated context reports:

${contextList}

## Required Work

- Produce an impact plan before editing.
- Apply code, docs, test, and lockfile changes only for active scoped apps.
- Keep app changes inside each scoped \`examples/<app>/**\` directory.
- Run \`pnpm examples:upgrade -- --mode verify --run-id ${runId} --example ${values.example}\` after edits.
- Complete \`docs/agents/example-upgrade-checklist.md\` during human review.
`;
  writeFileSync(join(outDir, "agent-task.md"), body);
}

function printUpgradeNextCommands() {
  if (mode === "prepare") {
    printNextCommands("Next commands", [
      {
        label: "Start implementing with Codex",
        command: agentCommand({ runId, example: values.example }),
      },
      {
        label: "Dry-run the Codex command first",
        command: `${agentCommand({ runId, example: values.example })} --dry-run`,
      },
    ]);
    return;
  }

  if (mode === "verify") {
    printNextCommands("Next commands", [
      {
        label: "Open or update a draft PR",
        command: prCommand({ runId, allowProcessFiles: true }),
      },
      {
        label: "Review the generated report",
        command: `cat .tmp/example-upgrades/${runId}/report.md`,
      },
    ]);
    return;
  }

  if (mode === "full") {
    printNextCommands("Next commands", [
      {
        label: "Start implementing with Codex if this was a dry run",
        command: agentCommand({ runId, example: values.example }),
      },
      {
        label: "Verify after agent changes",
        command: verifyCommand({
          runId,
          example: values.example,
          includeInstall: true,
          includePlaywrightInstall: true,
        }),
      },
      {
        label: "Open or update a draft PR",
        command: prCommand({ runId, allowProcessFiles: true }),
      },
    ]);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function addBooleanFlag(args, name, enabled) {
  if (enabled) {
    args.push(`--${name}`);
  }
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
