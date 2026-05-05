export const defaultCodexModel = "gpt-5.5";

export function printNextCommands(title, commands) {
  const filtered = commands.filter(Boolean);
  if (filtered.length === 0) {
    return;
  }
  console.log("");
  console.log(title);
  for (const { label, command } of filtered) {
    console.log(`- ${label}: \`${command}\``);
  }
}

export function agentCommand({ runId, example, agent = "codex", model = defaultCodexModel }) {
  const scopedExample = example === "active" ? null : example;
  return [
    "pnpm examples:upgrade:agent --",
    `--run-id ${runId}`,
    scopedExample ? `--example ${scopedExample}` : null,
    `--agent ${agent}`,
    `--model ${model}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function verifyCommand({
  runId,
  example,
  includeInstall = false,
  includePlaywrightInstall = false,
  includeEnvSensitive = false,
  ciParity = false,
} = {}) {
  const scopedExample = example === "active" ? null : example;
  return [
    "pnpm examples:upgrade -- --mode verify",
    `--run-id ${runId}`,
    scopedExample ? `--example ${scopedExample}` : null,
    includeInstall ? "--include-install" : null,
    includePlaywrightInstall ? "--include-playwright-install" : null,
    includeEnvSensitive ? "--include-env-sensitive" : null,
    ciParity ? "--ci-parity" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function reportCommand({ runId, example } = {}) {
  const scopedExample = example === "active" ? null : example;
  return [
    "pnpm examples:upgrade:report --",
    `--run-id ${runId}`,
    scopedExample ? `--example ${scopedExample}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function prCommand({ runId, allowProcessFiles = false } = {}) {
  return [
    "pnpm examples:upgrade:pr --",
    allowProcessFiles ? "--allow-process-files" : null,
    "--push",
    "--create-pr",
    `--body-file .tmp/example-upgrades/${runId}/report.md`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function prepareCommand({ example, target = "latest" } = {}) {
  return [
    "pnpm examples:upgrade -- --mode prepare",
    example ? `--example ${example}` : null,
    `--target ${target}`,
  ]
    .filter(Boolean)
    .join(" ");
}
