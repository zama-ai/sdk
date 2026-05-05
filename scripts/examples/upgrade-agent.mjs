import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { printNextCommands, verifyCommand } from "./lib/next-commands.mjs";

const root = process.cwd();
const manifest = readJson("examples/examples-upgrade.config.json");

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    agent: { type: "string", default: "codex" },
    model: { type: "string" },
    example: { type: "string" },
    out: { type: "string" },
    "run-id": { type: "string" },
    sandbox: { type: "string", default: "workspace-write" },
    approval: { type: "string", default: "on-request" },
    profile: { type: "string" },
    effort: { type: "string" },
    "prompt-file": { type: "string" },
    "output-file": { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? latestRunId(outRoot);
if (!runId) {
  throw new Error(
    `No generated run found under ${outRoot}. Run examples:upgrade -- --mode prepare first.`,
  );
}

const runDir = join(root, outRoot, runId);
const taskPath = join(runDir, "agent-task.md");
if (!existsSync(taskPath)) {
  throw new Error(
    `Agent task not found: ${relative(root, taskPath)}. Run examples:upgrade -- --mode prepare.`,
  );
}
assertSafeBranch();

mkdirSync(runDir, { recursive: true });

const prompt = values["prompt-file"]
  ? readFileSync(join(root, values["prompt-file"]), "utf8")
  : buildPrompt();
const promptPath = join(runDir, "agent-prompt.md");
writeFileSync(promptPath, prompt);

const agentOutputPath = join(
  root,
  values["output-file"] ?? relative(root, join(runDir, "agent-last-message.md")),
);
const agentCommand = buildCommand(agentOutputPath);
writeFileSync(
  join(runDir, "agent-command.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      runId,
      agent: values.agent,
      model: values.model ?? null,
      cwd: root,
      command: displayCommand(agentCommand),
      prompt: relative(root, promptPath),
      output: relative(root, agentOutputPath),
    },
    null,
    2,
  )}\n`,
);

if (values["dry-run"]) {
  console.log(`Prompt written to ${relative(root, promptPath)}`);
  console.log(`Output would be written to ${relative(root, agentOutputPath)}`);
  console.log(`Command: ${displayCommand(agentCommand).map(shellQuote).join(" ")}`);
  printNextCommands("Next commands", [
    {
      label: "Run the agent",
      command: [
        "pnpm examples:upgrade:agent --",
        `--run-id ${runId}`,
        values.example ? `--example ${values.example}` : null,
        `--agent ${values.agent}`,
        values.model ? `--model ${values.model}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  ]);
  process.exit(0);
}

const [binary, ...args] = agentCommand;
const result = spawnSync(binary, args, {
  cwd: root,
  input: prompt,
  stdio: ["pipe", "inherit", "inherit"],
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

printNextCommands("Next commands", [
  {
    label: "Verify the agent changes",
    command: verifyCommand({
      runId,
      example: values.example,
      includeInstall: true,
      includePlaywrightInstall: true,
    }),
  },
  {
    label: "Verify without dependency installs",
    command: verifyCommand({ runId, example: values.example }),
  },
]);

function assertSafeBranch() {
  const branchResult = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  });
  const branch = branchResult.stdout.trim();
  if (branch === "prerelease" || branch === "main") {
    throw new Error(
      `Refusing to run an upgrade agent directly on '${branch}'. Create a dedicated branch/worktree based on prerelease first.`,
    );
  }
}

function buildCommand(lastMessagePath) {
  if (values.agent === "codex") {
    const codexCommand = [
      "codex",
      "--ask-for-approval",
      values.approval,
      "exec",
      "--cd",
      root,
      "--sandbox",
      values.sandbox,
      "--output-last-message",
      lastMessagePath,
    ];
    if (values.model) {
      codexCommand.push("--model", values.model);
    }
    if (values.profile) {
      codexCommand.push("--profile", values.profile);
    }
    codexCommand.push("-");
    return codexCommand;
  }

  if (values.agent === "claude") {
    const claudeCommand = ["claude", "--print"];
    if (values.model) {
      claudeCommand.push("--model", values.model);
    }
    if (values.effort) {
      claudeCommand.push("--effort", values.effort);
    }
    claudeCommand.push("--permission-mode", mapClaudePermissionMode(values.approval));
    claudeCommand.push("--add-dir", root);
    claudeCommand.push(prompt);
    return claudeCommand;
  }

  throw new Error(`Unsupported agent '${values.agent}'. Supported agents: codex, claude.`);
}

function displayCommand(commandArgs) {
  if (values.agent !== "claude") {
    return commandArgs;
  }
  return commandArgs.map((arg) =>
    arg === prompt ? `<prompt from ${relative(root, promptPath)}>` : arg,
  );
}

function buildPrompt() {
  const task = readFileSync(taskPath, "utf8");
  const contextFiles = contextPaths();
  const contextList =
    contextFiles.map((path) => `- ${path}`).join("\n") || "- No context files found.";
  const exampleLine = values.example
    ? `Only work on the \`${values.example}\` example unless the task explicitly says otherwise.`
    : "Work only on examples included in the generated agent task.";

  return `You are running the Zama SDK examples upgrade process.

Repository root: ${root}

Run ID: ${runId}

${exampleLine}

Follow these instructions exactly:

1. Read \`docs/agents/example-upgrade.md\`.
2. Read \`${relative(root, taskPath)}\`.
3. Read the generated context file(s):
${contextList}
4. Produce an impact plan before editing.
5. Apply the required upgrade changes.
6. Run the validation command from the agent task.
7. Generate or update the report.
8. In your final answer, summarize changes, validation results, and remaining manual checks.

Do not modify apps marked future or excluded in \`examples/examples-upgrade.config.json\`.

Generated task:

${task}
`;
}

function contextPaths() {
  const indexPath = join(runDir, "index.json");
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    return (index.apps ?? [])
      .filter((app) => !values.example || app.name === values.example)
      .map((app) => app.context);
  }
  return [];
}

function mapClaudePermissionMode(approval) {
  if (approval === "never") {
    return "dontAsk";
  }
  if (approval === "on-request") {
    return "default";
  }
  return "default";
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

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function cliArgs() {
  return process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
}
