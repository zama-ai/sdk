import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const root = process.cwd();

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    branch: { type: "string", default: "chore/update-examples-sdk" },
    base: { type: "string", default: "prerelease" },
    title: { type: "string", default: "chore(examples): update SDK examples" },
    "commit-message": { type: "string", default: "chore(examples): update SDK examples" },
    "body-file": { type: "string" },
    push: { type: "boolean", default: false },
    "create-pr": { type: "boolean", default: false },
    draft: { type: "boolean", default: true },
    "allow-process-files": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

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
  console.log(`Push: ${values.push || values["create-pr"]}`);
  console.log(`Create PR: ${values["create-pr"]}`);
  process.exit(0);
}

ensureBranch(values.branch);

run("git", ["add", ...changedFiles.map((line) => line.slice(3))]);

const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
if (staged.length === 0) {
  throw new Error("No staged changes after git add.");
}

run("git", ["commit", "-m", values["commit-message"]]);

if (values.push || values["create-pr"]) {
  run("git", ["push", "-u", "origin", values.branch]);
}

if (values["create-pr"]) {
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
  const bodyArgs = prBodyArgs();
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
  if (values.draft) {
    args.push("--draft");
  }
  run("gh", args);
}

function prBodyArgs() {
  if (values["body-file"]) {
    const bodyPath = join(root, values["body-file"]);
    if (!existsSync(bodyPath)) {
      throw new Error(`Body file does not exist: ${values["body-file"]}`);
    }
    return ["--body-file", values["body-file"]];
  }
  return [
    "--body",
    [
      "Automated SDK example upgrade.",
      "",
      "Validation details should be attached from `.tmp/example-upgrades/<run-id>/report.md`.",
    ].join("\n"),
  ];
}

function assertAllowedFiles(statusLines) {
  const files = statusLines.map((line) => line.slice(3));
  const processPrefixes = [
    ".gitignore",
    "package.json",
    "docs/agents/example-upgrade",
    "examples/examples-upgrade.config.json",
    "scripts/examples/",
  ];
  const disallowed = files.filter((file) => {
    if (file.startsWith("examples/")) {
      return false;
    }
    return !(
      values["allow-process-files"] && processPrefixes.some((prefix) => file.startsWith(prefix))
    );
  });
  if (disallowed.length > 0) {
    throw new Error(
      `Refusing to commit files outside examples/**. Re-run with --allow-process-files for process tooling.\n${disallowed.join(
        "\n",
      )}`,
    );
  }
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

function cliArgs() {
  return process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
}
