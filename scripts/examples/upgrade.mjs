import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

const root = process.cwd();
const manifestPath = "examples/examples-upgrade.config.json";
const sourcesPath = "docs/agents/example-upgrade-sources.json";
const manifest = readJson(manifestPath);
const sources = readJson(sourcesPath);
const defaultCodexModel = "gpt-5.5";

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    target: { type: "string", default: "latest" },
    stage: { type: "string" },
    out: { type: "string" },
    "run-id": { type: "string" },
    agent: { type: "string" },
    model: { type: "string" },
    sandbox: { type: "string", default: "workspace-write" },
    approval: { type: "string", default: "on-request" },
    profile: { type: "string" },
    effort: { type: "string" },
    pr: { type: "string", default: "none" },
    branch: { type: "string", default: "chore/update-examples-sdk" },
    base: { type: "string", default: "prerelease" },
    title: { type: "string", default: "chore(examples): update SDK examples" },
    "commit-message": { type: "string", default: "chore(examples): update SDK examples" },
    "allow-process-files": { type: "boolean", default: false },
    "include-install": { type: "boolean", default: false },
    "include-env-sensitive": { type: "boolean", default: false },
    "include-playwright-install": { type: "boolean", default: false },
    "ci-parity": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const outRoot = values.out ?? manifest.defaults.generatedReportsDir;
const runId = values["run-id"] ?? `upgrade-${timestamp()}`;
const outDir = join(root, outRoot, runId);
const stage = resolveStage();
const agent = values.agent ?? "codex";
const model = values.model ?? (agent === "codex" ? defaultCodexModel : undefined);

validateOptions();
mkdirSync(outDir, { recursive: true });

if (stage === "prepare" || stage === "all") {
  generateContext();
  writeAgentTask();
}

if (stage === "agent" || stage === "all") {
  runAgent();
}

if (stage === "verify" || stage === "report" || stage === "pr" || stage === "all") {
  syncGeneratedLlmArtifacts();
}

if (stage === "verify" || stage === "all") {
  runValidation();
  generateReport();
}

if (stage === "report") {
  generateReport();
}

if (stage === "pr" || (stage === "all" && values.pr !== "none")) {
  createOrUpdatePr();
}

printNextCommands();

function resolveStage() {
  if (values.stage) {
    return values.stage;
  }
  if (values.pr !== "none" || values.agent) {
    return "all";
  }
  return "prepare";
}

function validateOptions() {
  const validStages = new Set(["prepare", "agent", "verify", "report", "pr", "all"]);
  if (!validStages.has(stage)) {
    throw new Error(
      `Unsupported --stage '${stage}'. Use prepare, agent, verify, report, pr, or all.`,
    );
  }
  const validPrModes = new Set(["none", "draft", "ready"]);
  if (!validPrModes.has(values.pr)) {
    throw new Error(`Unsupported --pr '${values.pr}'. Use none, draft, or ready.`);
  }
  if ((stage === "agent" || stage === "all") && agent === "none") {
    throw new Error("Cannot run the agent stage with --agent none.");
  }
}

function generateContext() {
  const selectedApps = selectApps(values.example);
  const packageMetadata = {
    "@zama-fhe/sdk": readJson("packages/sdk/package.json"),
    "@zama-fhe/react-sdk": readJson("packages/react-sdk/package.json"),
  };
  const reports = [];

  for (const app of selectedApps) {
    const report = buildContextReport(app, packageMetadata);
    reports.push(report);
    const appDir = join(outDir, app.name);
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "context.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(appDir, "context.md"), renderContextMarkdown(report));
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
}

function buildContextReport(app, packageMetadata) {
  const packageJson = readJson(join(app.path, "package.json"));
  const sdkPackages = app.sdkPackages ?? manifest.defaults.sdkPackages;
  const currentVersions = {};
  const targetVersions = {};

  for (const packageName of sdkPackages) {
    currentVersions[packageName] = findDeclaredVersion(packageJson, packageName);
    targetVersions[packageName] = resolveTargetVersion(packageName, values.target, packageMetadata);
  }

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
    usageScan: scanUsage(app),
    nextSteps: [
      "Read this context report and the listed source files.",
      "Write an impact plan before editing.",
      `Limit app changes to ${app.path}/** unless process files are explicitly in scope.`,
      "Run pnpm examples:upgrade after changes with --stage verify.",
    ],
  };
}

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
- Run \`pnpm examples:upgrade -- --stage verify --run-id ${runId} --example ${values.example}\` after edits.
- Complete \`docs/agents/example-upgrade-checklist.md\` during human review.
`;
  writeFileSync(join(outDir, "agent-task.md"), body);
}

function runAgent() {
  const taskPath = join(outDir, "agent-task.md");
  if (!existsSync(taskPath)) {
    throw new Error(`Agent task not found. Run --stage prepare first or use --stage all.`);
  }
  assertSafeBranch();

  const prompt = buildAgentPrompt(taskPath);
  const promptPath = join(outDir, "agent-prompt.md");
  const outputPath = join(outDir, "agent-last-message.md");
  writeFileSync(promptPath, prompt);

  const command = buildAgentCommand(outputPath, prompt);
  writeFileSync(
    join(outDir, "agent-command.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        agent,
        model: model ?? null,
        cwd: root,
        command: displayAgentCommand(command, prompt, promptPath),
        prompt: relative(root, promptPath),
        output: relative(root, outputPath),
      },
      null,
      2,
    )}\n`,
  );

  if (values["dry-run"]) {
    console.log(`Prompt written to ${relative(root, promptPath)}`);
    console.log(`Output would be written to ${relative(root, outputPath)}`);
    console.log(
      `Command: ${displayAgentCommand(command, prompt, promptPath).map(shellQuote).join(" ")}`,
    );
    return;
  }

  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: root,
    input: prompt,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runValidation() {
  const results = [];
  for (const app of selectApps(values.example)) {
    const appResults = validateApp(app);
    results.push({ app: app.name, path: app.path, results: appResults });
    const appDir = join(outDir, app.name);
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "validation.json"), `${JSON.stringify(appResults, null, 2)}\n`);
  }

  const llmResults = validateGeneratedLlmArtifacts();
  results.push({ app: "repo-llm-artifacts", path: ".", results: llmResults });
  writeFileSync(
    join(outDir, "repo-llm-artifacts.validation.json"),
    `${JSON.stringify(llmResults, null, 2)}\n`,
  );

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
  if (failed.length > 0) {
    process.exitCode = 1;
  }
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
    return runValidationCommand(entry.command, app.path, entry.kind);
  });
}

function validateGeneratedLlmArtifacts() {
  return [runValidationCommand("pnpm llm:build", ".", "repo-generated-docs")];
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
  return commands.map((command) => runValidationCommand(command, ".", "ci-parity"));
}

function runValidationCommand(command, cwd, kind) {
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

function generateReport() {
  const apps = selectApps(values.example);
  const sections = apps.map((app) => renderAppReport(app)).join("\n\n");
  const llmValidation = readOptionalJson(join(outDir, "repo-llm-artifacts.validation.json"));
  const llmSection = renderValidationSection("Repository LLM Artifacts", llmValidation);
  const ciValidation = readOptionalJson(join(outDir, "ci-parity.validation.json"));
  const ciSection = ciValidation
    ? `\n\n${renderValidationSection("Repository CI Parity", ciValidation)}`
    : "";
  const body = `# Example Upgrade Report

Run ID: \`${runId}\`

Generated: ${new Date().toISOString()}

${sections}

${llmSection}${ciSection}
`;

  writeFileSync(join(outDir, "report.md"), body);
  console.log(`Report written to ${relative(root, join(outDir, "report.md"))}`);
}

function renderValidationSection(title, validation) {
  const lines = validation
    ? validation.map(
        (entry) =>
          `- ${entry.status}: \`${entry.command ?? entry.kind}\`${entry.message ? ` - ${entry.message}` : ""}`,
      )
    : ["- No validation results found for this run."];
  return `## ${title}

${lines.join("\n")}`;
}

function renderAppReport(app) {
  const appDir = join(outDir, app.name);
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

function createOrUpdatePr() {
  if (values.pr === "none") {
    console.log("Skipping PR creation because --pr none.");
    return;
  }

  const changedFiles = git(["status", "--short"]).split(/\r?\n/).filter(Boolean);
  if (changedFiles.length === 0) {
    throw new Error("No changes to commit.");
  }
  assertAllowedFiles(changedFiles);

  if (values["dry-run"]) {
    console.log("Dry run: would commit files:");
    console.log(changedFiles.map((line) => `- ${line.slice(3)}`).join("\n"));
    console.log(`Branch: ${values.branch}`);
    console.log(`Base: ${values.base}`);
    console.log(`PR mode: ${values.pr}`);
    return;
  }

  ensureBranch(values.branch);
  run("git", ["add", ...changedFiles.map((line) => line.slice(3))]);

  const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
  if (staged.length === 0) {
    throw new Error("No staged changes after git add.");
  }

  run("git", ["commit", "-m", values["commit-message"]]);
  run("git", ["push", "-u", "origin", values.branch]);
  upsertPullRequest();
}

function upsertPullRequest() {
  const existing = gh([
    "pr",
    "list",
    "--head",
    values.branch,
    "--base",
    values.base,
    "--state",
    "open",
    "--json",
    "number",
    "--jq",
    ".[0].number // empty",
  ]).trim();
  const bodyArgs = ["--body-file", relative(root, join(outDir, "report.md"))];
  if (existing) {
    run("gh", ["pr", "edit", existing, "--title", values.title, ...bodyArgs]);
    console.log(`Updated PR #${existing}.`);
    return;
  }

  const args = [
    "pr",
    "create",
    "--base",
    values.base,
    "--head",
    values.branch,
    "--title",
    values.title,
    ...bodyArgs,
  ];
  if (values.pr === "draft") {
    args.push("--draft");
  }
  run("gh", args);
}

function buildAgentPrompt(taskPath) {
  const task = readFileSync(taskPath, "utf8");
  const contextFiles = contextPaths();
  const contextList =
    contextFiles.map((path) => `- ${path}`).join("\n") || "- No context files found.";
  const exampleLine =
    values.example && values.example !== "active"
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
7. If README.md, WALKTHROUGH.md, or docs changed, run \`pnpm llm:build\` and keep the generated LLM corpus artifacts.
8. Generate or update the report.
9. In your final answer, summarize changes, validation results, and remaining manual checks.

Do not modify apps marked future or excluded in \`examples/examples-upgrade.config.json\`.

Generated task:

${task}
`;
}

function buildAgentCommand(outputPath, prompt) {
  if (agent === "codex") {
    const command = [
      "codex",
      "--ask-for-approval",
      values.approval,
      "exec",
      "--cd",
      root,
      "--sandbox",
      values.sandbox,
      "--output-last-message",
      outputPath,
    ];
    if (model) {
      command.push("--model", model);
    }
    if (values.profile) {
      command.push("--profile", values.profile);
    }
    command.push("-");
    return command;
  }

  if (agent === "claude") {
    const command = ["claude", "--print"];
    if (model) {
      command.push("--model", model);
    }
    if (values.effort) {
      command.push("--effort", values.effort);
    }
    command.push("--permission-mode", mapClaudePermissionMode(values.approval));
    command.push("--add-dir", root);
    command.push(prompt);
    return command;
  }

  throw new Error(`Unsupported --agent '${agent}'. Use codex or claude.`);
}

function displayAgentCommand(command, prompt, promptPath) {
  if (agent !== "claude") {
    return command;
  }
  return command.map((arg) =>
    arg === prompt ? `<prompt from ${relative(root, promptPath)}>` : arg,
  );
}

function selectApps(example) {
  const apps = manifest.apps ?? [];
  if (example === "active") {
    return apps.filter((app) => app.status === "active");
  }
  const selected = apps.find((app) => app.name === example);
  if (!selected) {
    throw new Error(`Unknown example '${example}'. See ${manifestPath}.`);
  }
  if (selected.status !== "active") {
    throw new Error(`Example '${example}' has status '${selected.status}' and is not active.`);
  }
  return [selected];
}

function resolveTargetVersion(packageName, target, packageMetadata) {
  if (/^\d+\.\d+\.\d+/.test(target)) {
    return { version: target, source: "explicit" };
  }
  if (target === "local") {
    return { version: packageMetadata[packageName]?.version, source: "local-package-json" };
  }
  try {
    if (target === "latest" || target === "highest") {
      return resolveLatestPublishedVersion(packageName);
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

function resolveLatestPublishedVersion(packageName) {
  const raw = npmView(packageName, "time");
  const time = JSON.parse(raw);
  const versions = Object.entries(time)
    .filter(([version]) => version !== "created" && version !== "modified")
    .map(([version, publishedAt]) => ({
      version,
      publishedAt: new Date(publishedAt).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.publishedAt))
    .toSorted((a, b) => b.publishedAt - a.publishedAt);

  if (versions.length === 0) {
    throw new Error(`No published versions found for ${packageName}.`);
  }

  return {
    version: versions[0].version,
    source: "npm time latest published version",
    publishedAt: new Date(versions[0].publishedAt).toISOString(),
  };
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

function renderContextMarkdown(report) {
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

function contextPaths() {
  const indexPath = join(outDir, "index.json");
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    return (index.apps ?? [])
      .filter((app) => values.example === "active" || app.name === values.example)
      .map((app) => app.context);
  }
  return [];
}

function assertSafeBranch() {
  const branch = git(["branch", "--show-current"]).trim();
  if (branch === "prerelease" || branch === "main") {
    throw new Error(
      `Refusing to run an upgrade agent directly on '${branch}'. Create a dedicated branch/worktree based on prerelease first.`,
    );
  }
}

function assertAllowedFiles(statusLines) {
  const files = statusLines.map((line) => line.slice(3));
  const selectedAppPrefixes = selectApps(values.example).map((app) => `${app.path}/`);
  const generatedLlmArtifacts = new Set([
    "llms.txt",
    "llms-full.txt",
    "docs/llm/corpus-manifest.json",
  ]);
  const processPrefixes = [
    ".gitignore",
    "package.json",
    "docs/agents/example-upgrade",
    "examples/examples-upgrade.config.json",
    "scripts/examples/",
  ];
  const disallowed = files.filter((file) => {
    if (selectedAppPrefixes.some((prefix) => file.startsWith(prefix))) {
      return false;
    }
    if (generatedLlmArtifacts.has(file)) {
      return false;
    }
    return !(
      values["allow-process-files"] && processPrefixes.some((prefix) => file.startsWith(prefix))
    );
  });
  if (disallowed.length > 0) {
    throw new Error(
      `Refusing to commit files outside the selected example(s) or generated LLM artifacts. Re-run with --allow-process-files for process tooling.\n${disallowed.join(
        "\n",
      )}`,
    );
  }
}

function syncGeneratedLlmArtifacts() {
  if (values["dry-run"]) {
    console.log("Dry run: would run pnpm llm:build before validation/report/PR.");
    return;
  }
  run("pnpm", ["llm:build"]);
}

function ensureBranch(branch) {
  const current = git(["branch", "--show-current"]).trim();
  if (current === branch) {
    return;
  }
  const exists = git(["branch", "--list", branch]).trim() !== "";
  if (exists) {
    run("git", ["switch", branch]);
  } else {
    run("git", ["switch", "-c", branch]);
  }
}

function mapClaudePermissionMode(approval) {
  if (approval === "never") {
    return "dontAsk";
  }
  return "default";
}

function gitChangedFiles(path) {
  try {
    const output = git(["diff", "--name-only", "--", path]).trim();
    return output ? output.split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

function listExisting(paths) {
  return paths.filter((path) => existsSync(join(root, path)));
}

function trimOutput(output) {
  const text = output?.trim() ?? "";
  return text.length > 12000 ? `${text.slice(0, 12000)}\n... truncated ...` : text;
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function readOptionalJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function gh(args) {
  return execFileSync("gh", args, { cwd: root, encoding: "utf8" });
}

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printNextCommands() {
  const next = [];
  if (stage === "prepare") {
    next.push({
      label: "Run the agent",
      command: upgradeCommand({
        commandStage: "agent",
        commandRunId: runId,
        example: values.example,
      }),
    });
    next.push({
      label: "Run everything including a draft PR",
      command: upgradeCommand({
        commandStage: "all",
        commandRunId: runId,
        example: values.example,
        pr: "draft",
      }),
    });
  }
  if (stage === "agent") {
    next.push({
      label: "Verify changes",
      command: upgradeCommand({
        commandStage: "verify",
        commandRunId: runId,
        example: values.example,
      }),
    });
  }
  if (stage === "verify" || stage === "report") {
    next.push({
      label: "Open or update a draft PR",
      command: upgradeCommand({
        commandStage: "pr",
        commandRunId: runId,
        example: values.example,
        pr: "draft",
      }),
    });
    next.push({
      label: "Read the report",
      command: `cat .tmp/example-upgrades/${runId}/report.md`,
    });
  }
  if (next.length > 0) {
    console.log("");
    console.log("Next commands");
    for (const { label, command } of next) {
      console.log(`- ${label}: \`${command}\``);
    }
  }
}

function upgradeCommand({ commandStage, commandRunId, example, pr = values.pr }) {
  return [
    "pnpm examples:upgrade",
    `--stage ${commandStage}`,
    `--run-id ${commandRunId}`,
    example && example !== "active" ? `--example ${example}` : null,
    `--target ${values.target}`,
    `--agent ${agent}`,
    model ? `--model ${model}` : null,
    pr !== "none" ? `--pr ${pr}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function cliArgs() {
  return process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
}

function printHelp() {
  console.log(`Usage:
  pnpm examples:upgrade --example react-wagmi --target latest
  pnpm examples:upgrade --example react-wagmi --target latest --agent codex --model gpt-5.5
  pnpm examples:upgrade --example react-wagmi --target latest --agent codex --model gpt-5.5 --pr draft

Key options:
  --stage prepare|agent|verify|report|pr|all  Default: prepare, or all when --agent/--pr is provided.
  --example <name|active>                      Default: active.
  --target latest|highest|local|<version>      Default: latest. latest/highest use newest npm publish time, including prereleases.
  --agent codex|claude                         Default: codex.
  --model <model>                              Default for codex: gpt-5.5.
  --pr none|draft|ready                        Default: none.
  --dry-run                                    Generate reports/commands without running agent, checks, or PR changes.
`);
}
