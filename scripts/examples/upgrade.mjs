import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

const root = process.cwd();
const manifestPath = "examples/examples-upgrade.config.json";
const sourcesPath = "docs/agents/example-upgrade-sources.json";
const manifest = readJson(manifestPath);
const sources = readJson(sourcesPath);
const defaultAgent = manifest.defaults.agent ?? "claude";
const defaultClaudeModel = manifest.defaults.model ?? "claude-sonnet-4-6";
const defaultCodexModel = "gpt-5.5";
const validAgentNames = new Set(["codex", "claude"]);
const requiredAnalysisHeadings = [
  "# Summary",
  "# Relevant Findings",
  "# Impact On Target Example",
  "# Required Changes",
  "# Risks",
  "# Validation Suggestions",
];
const analysisRoles = [
  {
    id: "history",
    label: "History Analyst",
    promptFile: "history-analyst.md",
    outputFile: "history-analysis.md",
  },
  {
    id: "docs-pattern",
    label: "Docs Pattern Analyst",
    promptFile: "docs-pattern-analyst.md",
    outputFile: "docs-pattern-analysis.md",
  },
  {
    id: "source",
    label: "Source Analyst",
    promptFile: "source-analyst.md",
    outputFile: "source-analysis.md",
  },
];

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    example: { type: "string", default: "active" },
    target: { type: "string", default: "latest" },
    stage: { type: "string" },
    analysis: { type: "string" },
    out: { type: "string" },
    "run-id": { type: "string" },
    agent: { type: "string" },
    model: { type: "string" },
    "analyst-agent": { type: "string" },
    "analyst-model": { type: "string" },
    "analyst-sandbox": { type: "string", default: "read-only" },
    sandbox: { type: "string", default: "workspace-write" },
    approval: { type: "string", default: "on-request" },
    profile: { type: "string" },
    effort: { type: "string" },
    skill: { type: "string", default: "zama-example-upgrade" },
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
    "allow-missing-analysis": { type: "boolean", default: false },
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
const analysisMode = values.analysis ?? manifest.defaults.analysis ?? "deep";
const agent = values.agent ?? defaultAgent;
const model = values.model ?? defaultModelFor(agent);
const analystAgent = values["analyst-agent"] ?? manifest.defaults.analystAgent ?? agent;
const analystModel =
  values["analyst-model"] ?? manifest.defaults.analystModel ?? defaultModelFor(analystAgent);
let validationFailed = false;

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

function main() {
  validateOptions();
  mkdirSync(outDir, { recursive: true });

  if (stage === "prepare" || stage === "all") {
    generateContext();
    writeAgentTask();
    writeAnalysisPrompts();
  }

  if (stage === "analysis" || stage === "all") {
    runAnalysis();
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
    if (validationFailed) {
      throw new Error("Refusing to create or update a PR because deterministic validation failed.");
    }
    createOrUpdatePr();
  }

  printNextCommands();
}

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
  const validStages = new Set(["prepare", "analysis", "agent", "verify", "report", "pr", "all"]);
  if (!validStages.has(stage)) {
    throw new Error(
      `Unsupported --stage '${stage}'. Use prepare, analysis, agent, verify, report, pr, or all.`,
    );
  }
  const validAnalysisModes = new Set(["standard", "deep"]);
  if (!validAnalysisModes.has(analysisMode)) {
    throw new Error(`Unsupported --analysis '${analysisMode}'. Use standard or deep.`);
  }
  const validSandboxModes = new Set(["read-only", "workspace-write", "danger-full-access"]);
  if (!validSandboxModes.has(values.sandbox)) {
    throw new Error(
      `Unsupported --sandbox '${values.sandbox}'. Use read-only, workspace-write, or danger-full-access.`,
    );
  }
  if (!validSandboxModes.has(values["analyst-sandbox"])) {
    throw new Error(
      `Unsupported --analyst-sandbox '${values["analyst-sandbox"]}'. Use read-only, workspace-write, or danger-full-access.`,
    );
  }
  const validPrModes = new Set(["none", "draft", "ready"]);
  if (!validPrModes.has(values.pr)) {
    throw new Error(`Unsupported --pr '${values.pr}'. Use none, draft, or ready.`);
  }
  if ((stage === "agent" || stage === "all") && agent === "none") {
    throw new Error("Cannot run the agent stage with --agent none.");
  }
  if ((stage === "analysis" || stage === "all") && analysisMode === "deep") {
    validateAgentName(analystAgent, "--analyst-agent");
  }
  if (stage === "agent" || stage === "all") {
    validateAgentName(agent, "--agent");
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
  assertResolvedTargetVersions(reports);

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

Analysis mode: \`${analysisMode}\`

Skill: \`${values.skill}\`

## Required Inputs

Use the \`${values.skill}\` skill if it is available.

Read \`docs/agents/example-upgrade.md\` before editing.

Read these generated context reports:

${contextList}

${
  analysisMode === "deep"
    ? `Read the generated analyst reports before implementation:

- ${relative(root, analysisReportPath("history"))}
- ${relative(root, analysisReportPath("docs-pattern"))}
- ${relative(root, analysisReportPath("source"))}
`
    : "No separate analyst reports are required in standard mode."
}

## Required Work

- Produce an impact plan before editing.
- Apply code, docs, test, and lockfile changes only for active scoped apps.
- Keep app changes inside each scoped \`examples/<app>/**\` directory.
- Run \`pnpm examples:upgrade --stage verify --run-id ${runId} --example ${values.example} --target ${values.target}\` after edits.
- Complete \`docs/agents/example-upgrade-checklist.md\` during human review.
`;
  writeFileSync(join(outDir, "agent-task.md"), body);
}

function runAgent() {
  const taskPath = join(outDir, "agent-task.md");
  if (!existsSync(taskPath)) {
    throw new Error(`Agent task not found. Run --stage prepare first or use --stage all.`);
  }
  if (analysisMode === "deep" && !values["dry-run"]) {
    assertAnalysisReportsReady();
  }
  assertSafeBranch();

  const prompt = buildAgentPrompt(taskPath);
  const promptPath = join(outDir, "agent-prompt.md");
  const outputPath = join(outDir, "agent-last-message.md");
  writeFileSync(promptPath, prompt);

  runAgentInvocation({
    role: "implementation",
    mode: "implementation",
    agentName: agent,
    modelName: model,
    prompt,
    promptPath,
    outputPath,
    commandPath: join(outDir, "agent-command.json"),
  });
}

function writeAnalysisPrompts() {
  if (analysisMode !== "deep") {
    return;
  }
  const promptsDir = join(outDir, "prompts");
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(join(outDir, "analysis"), { recursive: true });
  for (const role of analysisRoles) {
    const promptPath = join(promptsDir, role.promptFile);
    writeFileSync(promptPath, buildAnalysisPrompt(role));
  }
}

function runAnalysis() {
  if (analysisMode !== "deep") {
    console.log("Skipping analysis stage because --analysis standard.");
    return;
  }
  const taskPath = join(outDir, "agent-task.md");
  if (!existsSync(taskPath)) {
    throw new Error(`Agent task not found. Run --stage prepare first or use --stage all.`);
  }
  writeAnalysisPrompts();
  for (const role of analysisRoles) {
    const promptPath = join(outDir, "prompts", role.promptFile);
    const outputPath = analysisReportPath(role.id);
    const prompt = readFileSync(promptPath, "utf8");
    runAgentInvocation({
      role: role.id,
      mode: "analysis",
      agentName: analystAgent,
      modelName: analystModel,
      prompt,
      promptPath,
      outputPath,
      commandPath: join(outDir, "analysis", `${role.id}-command.json`),
    });
  }
  if (values["dry-run"]) {
    return;
  }
  assertAnalysisReportsReady();
}

function runAgentInvocation({
  role,
  mode,
  agentName,
  modelName,
  prompt,
  promptPath,
  outputPath,
  commandPath,
}) {
  const command = buildAgentCommand({ mode, agentName, modelName, outputPath, prompt });
  writeFileSync(
    commandPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        role,
        mode,
        agent: agentName,
        model: modelName ?? null,
        cwd: root,
        command: displayAgentCommand(command, agentName, prompt, promptPath),
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
      `Command: ${displayAgentCommand(command, agentName, prompt, promptPath)
        .map(shellQuote)
        .join(" ")}`,
    );
    return;
  }

  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: root,
    input: prompt,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  if (!existsSync(outputPath)) {
    writeFileSync(outputPath, result.stdout?.trim() ? `${result.stdout.trim()}\n` : "");
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
    validationFailed = true;
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
  const analysisSection = renderAnalysisReportSection();
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

${analysisSection}

${llmSection}${ciSection}
`;

  writeFileSync(join(outDir, "report.md"), body);
  console.log(`Report written to ${relative(root, join(outDir, "report.md"))}`);
}

function renderAnalysisReportSection() {
  if (analysisMode !== "deep") {
    return `## Deep Analysis

- Mode: \`standard\`; no separate analyst reports were required.`;
  }

  const lines = analysisRoles.map((role) => {
    const path = analysisReportPath(role.id);
    const status = existsSync(path) ? "available" : "missing";
    return `- ${role.label}: ${status} at \`${relative(root, path)}\``;
  });

  return `## Deep Analysis

${lines.join("\n")}`;
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

  const reportPath = join(outDir, "report.md");
  if (!existsSync(reportPath)) {
    throw new Error(
      `PR report not found at ${relative(
        root,
        reportPath,
      )}. Run --stage verify or --stage report before --stage pr.`,
    );
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
  if (existing) {
    const inputPath = join(outDir, "pr-update.json");
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        title: values.title,
        body: readFileSync(join(outDir, "report.md"), "utf8"),
      })}\n`,
    );
    run("gh", ["api", `repos/:owner/:repo/pulls/${existing}`, "-X", "PATCH", "--input", inputPath]);
    console.log(`Updated PR #${existing}.`);
    return;
  }

  const bodyArgs = ["--body-file", relative(root, join(outDir, "report.md"))];
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
  const analysisFiles = analysisRoles
    .map((role) => `- ${role.label}: ${relative(root, analysisReportPath(role.id))}`)
    .join("\n");
  const exampleLine =
    values.example && values.example !== "active"
      ? `Only work on the \`${values.example}\` example unless the task explicitly says otherwise.`
      : "Work only on examples included in the generated agent task.";

  return `You are running the Zama SDK examples upgrade process.

Repository root: ${root}

Run ID: ${runId}

${exampleLine}

Follow these instructions exactly:

1. Use the \`${values.skill}\` skill if it is available.
2. Read \`docs/agents/example-upgrade.md\`.
3. Read \`${relative(root, taskPath)}\`.
4. Read the generated context file(s):
${contextList}
5. Read these analyst reports before editing:
${analysisMode === "deep" ? analysisFiles : "- Standard mode: no separate analyst reports."}
6. Produce an impact plan before editing.
7. Apply the required upgrade changes.
8. Run the validation command from the agent task.
9. If README.md, WALKTHROUGH.md, or docs changed, run \`pnpm llm:build\` and keep the generated LLM corpus artifacts.
10. Run \`pnpm format:check\` after generated docs/artifacts change; CI lint includes formatting.
11. Avoid placeholder token/contract addresses. Prefer a child component that only mounts token-dependent hooks once real registry/config data exists. If the published target SDK type forces a placeholder, document why.
12. Verify hook options against the example app's declared SDK package version, not only local monorepo source.
13. Generate or update the report.
14. In your final answer, summarize changes, validation results, and remaining manual checks.

Do not modify apps marked future or excluded in \`examples/examples-upgrade.config.json\`.

Generated task:

${task}
`;
}

function buildAnalysisPrompt(role) {
  const contextFiles = contextPaths();
  const contextList =
    contextFiles.map((path) => `- ${path}`).join("\n") || "- No context files found.";
  const sourceGuide = relative(root, join(outDir, "agent-task.md"));
  const commonHeader = `You are the ${role.label} for a Zama SDK example upgrade.

Repository root: ${root}

Run ID: ${runId}

Scope: ${values.example}

Target: ${values.target}

Use the \`${values.skill}\` skill if it is available.

Read first:

- docs/agents/example-upgrade.md
- ${sourceGuide}
- Generated context files:
${contextList}

Output a concise markdown report with exactly these headings:

# Summary
# Relevant Findings
# Impact On Target Example
# Required Changes
# Risks
# Validation Suggestions

Do not edit files. Do not run implementation commands.`;

  if (role.id === "history") {
    return `${commonHeader}

Focus:

- Compare the app's declared SDK package versions with the resolved target versions.
- Read CHANGELOG.md excerpts and relevant API report changes.
- Use git history only to identify relevant SDK changes since the app's current declared version or last upgrade commit when discoverable.
- Highlight behavior/API changes that can affect the scoped example.
`;
  }

  if (role.id === "docs-pattern") {
    return `${commonHeader}

Focus:

- Read the recommended official docs from the generated context.
- Identify current high-level SDK and React SDK patterns the example should use.
- Prefer documented hooks/utilities over local orchestration.
- Flag docs/source mismatches and any manual checklist items that need human verification.
`;
  }

  if (role.id === "source") {
    return `${commonHeader}

Focus:

- Inspect package exports, API reports, and SDK/react-sdk source for the exact primitives available to the target version.
- Verify hook signatures and options against the example app's declared package version.
- Identify local reimplementations that should be replaced by SDK hooks/utils.
- Flag risky migrations such as placeholder addresses, direct relayer calls, manual cache invalidation, or legacy APIs.
`;
  }

  throw new Error(`Unknown analysis role '${role.id}'.`);
}

function buildAgentCommand({ mode, agentName, modelName, outputPath, prompt }) {
  if (agentName === "codex") {
    const command = [
      "codex",
      "--ask-for-approval",
      values.approval,
      "exec",
      "--cd",
      root,
      "--sandbox",
      mode === "analysis" ? values["analyst-sandbox"] : values.sandbox,
      "--output-last-message",
      outputPath,
    ];
    if (modelName) {
      command.push("--model", modelName);
    }
    if (values.profile) {
      command.push("--profile", values.profile);
    }
    command.push("-");
    return command;
  }

  if (agentName === "claude") {
    const command = ["claude", "--print"];
    if (modelName) {
      command.push("--model", modelName);
    }
    if (values.effort) {
      command.push("--effort", values.effort);
    }
    command.push("--permission-mode", mapClaudePermissionMode(values.approval));
    if (mode === "analysis") {
      command.push("--disallowedTools", "Edit,MultiEdit,Write,NotebookEdit");
    }
    command.push("--add-dir", root);
    command.push(prompt);
    return command;
  }

  throw new Error(`Unsupported agent '${agentName}'. Use codex or claude.`);
}

function displayAgentCommand(command, agentName, prompt, promptPath) {
  if (agentName !== "claude") {
    return command;
  }
  return command.map((arg) =>
    arg === prompt ? `<prompt from ${relative(root, promptPath)}>` : arg,
  );
}

function defaultModelFor(agentName) {
  if (agentName === "codex") {
    return defaultCodexModel;
  }
  if (agentName === "claude") {
    return defaultClaudeModel;
  }
  return undefined;
}

function validateAgentName(agentName, optionName) {
  if (!validAgentNames.has(agentName)) {
    throw new Error(`Unsupported ${optionName} '${agentName}'. Use codex or claude.`);
  }
}

function analysisReportPath(roleId) {
  const role = analysisRoles.find((candidate) => candidate.id === roleId);
  if (!role) {
    throw new Error(`Unknown analysis role '${roleId}'.`);
  }
  return join(outDir, "analysis", role.outputFile);
}

function assertAnalysisReportsReady() {
  const failures = analysisRoles.flatMap((role) => {
    const path = analysisReportPath(role.id);
    if (!existsSync(path)) {
      return [`Missing ${role.label} report: ${relative(root, path)}`];
    }
    const text = readFileSync(path, "utf8");
    const missingHeadings = requiredAnalysisHeadings.filter((heading) => !text.includes(heading));
    if (missingHeadings.length === 0) {
      return [];
    }
    return [
      `${role.label} report is missing headings in ${relative(root, path)}: ${missingHeadings.join(
        ", ",
      )}`,
    ];
  });

  if (failures.length === 0) {
    return;
  }
  const message = `Deep analysis reports are incomplete.\n${failures
    .map((failure) => `- ${failure}`)
    .join("\n")}\nRun \`pnpm examples:upgrade --stage analysis --run-id ${runId} --example ${
    values.example
  } --target ${values.target}\` before the agent stage.`;
  if (values["allow-missing-analysis"]) {
    console.warn(`${message}\nContinuing because --allow-missing-analysis was provided.`);
    return;
  }
  throw new Error(`${message}\nUse --allow-missing-analysis only for manual debugging.`);
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

function assertResolvedTargetVersions(reports) {
  const unresolved = reports.flatMap((report) =>
    Object.entries(report.packageVersions.target)
      .filter(([, result]) => !result?.version)
      .map(([packageName, result]) => ({
        app: report.app.name,
        packageName,
        source: result?.source ?? "unknown",
        error: result?.error,
      })),
  );
  if (unresolved.length === 0) {
    return;
  }
  throw new Error(
    `Cannot continue because target SDK package versions could not be resolved:\n${unresolved
      .map(
        (entry) =>
          `- ${entry.app}: ${entry.packageName} from ${entry.source}${
            entry.error ? ` (${entry.error})` : ""
          }`,
      )
      .join("\n")}`,
  );
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
    "skills/zama-example-upgrade/",
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
    if (analysisMode === "deep") {
      next.push({
        label: "Run deep analysis",
        command: upgradeCommand({
          commandStage: "analysis",
          commandRunId: runId,
          example: values.example,
        }),
      });
    }
    next.push({
      label:
        analysisMode === "deep" ? "Run the implementation agent after analysis" : "Run the agent",
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
  if (stage === "analysis") {
    next.push({
      label: "Run the implementation agent",
      command: upgradeCommand({
        commandStage: "agent",
        commandRunId: runId,
        example: values.example,
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
    `--analysis ${analysisMode}`,
    `--agent ${agent}`,
    model ? `--model ${model}` : null,
    values.sandbox !== "workspace-write" ? `--sandbox ${values.sandbox}` : null,
    values.approval !== "on-request" ? `--approval ${values.approval}` : null,
    values.profile ? `--profile ${values.profile}` : null,
    values.effort ? `--effort ${values.effort}` : null,
    analysisMode === "deep" ? `--analyst-agent ${analystAgent}` : null,
    analysisMode === "deep" && analystModel ? `--analyst-model ${analystModel}` : null,
    analysisMode === "deep" && values["analyst-sandbox"] !== "read-only"
      ? `--analyst-sandbox ${values["analyst-sandbox"]}`
      : null,
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
  pnpm examples:upgrade --stage analysis --run-id <run-id> --example react-wagmi
  pnpm examples:upgrade --stage agent --run-id <run-id> --example react-wagmi
  pnpm examples:upgrade --example react-wagmi --target latest --pr draft

Key options:
  --stage prepare|analysis|agent|verify|report|pr|all  Default: prepare, or all when --agent/--pr is provided.
  --example <name|active>                             Default: active.
  --target latest|highest|local|<version>             Default: latest. latest/highest use newest npm publish time, including prereleases.
  --analysis standard|deep                            Default: deep.
  --agent codex|claude                                Default: claude.
  --model <model>                                     Default for claude: claude-sonnet-4-6. Default for codex: gpt-5.5.
  --analyst-agent codex|claude                        Default: claude.
  --analyst-model <model>                             Default: claude-sonnet-4-6.
  --analyst-sandbox <mode>                            Default: read-only for Codex analyst runs.
  --skill <name>                                      Default: zama-example-upgrade.
  --allow-missing-analysis                            Allow agent stage without complete deep analysis reports.
  --pr none|draft|ready                               Default: none.
  --dry-run                                           Generate reports/commands without running agent, checks, or PR changes.
`);
}
