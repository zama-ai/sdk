import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`${command} terminated by ${result.signal}`);
  }
  return result;
}

function report(title, message) {
  console.log(`${title}\n${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${title}\n\n${message}\n\n`);
  }
}

function main() {
  const base = process.argv[2];
  if (!base || process.argv.length !== 3) {
    throw new Error(
      "Usage: pnpm exec node scripts/daemon/check-proto-compatibility.mjs <base-ref>",
    );
  }
  const commit = run("git", ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]);
  if (commit.status !== 0) {
    throw new Error(commit.stderr.trim());
  }
  const sha = commit.stdout.trim();
  const tree = run("git", ["ls-tree", "-r", "--name-only", sha, "--", "proto"]);
  if (tree.status !== 0) {
    throw new Error(tree.stderr.trim());
  }
  if (!tree.stdout.split("\n").some((file) => file.endsWith(".proto"))) {
    report(
      "Protobuf compatibility",
      "No protobuf schema exists at the base; this is the initial schema introduction.",
    );
    return;
  }

  const baseline = `.#format=git,ref=${sha}`;
  // Buf uses exit 100 for both schema errors and compatibility findings.
  for (const input of [".", baseline]) {
    const build = run("buf", ["build", input]);
    if (build.status !== 0) {
      throw new Error(
        `Protobuf schema validation failed for ${input}.\n${build.stdout}${build.stderr}`,
      );
    }
  }
  const result = run("buf", ["breaking", "--against", baseline]);
  const output = `${result.stdout}${result.stderr}`.trim();
  if (result.status === 0) {
    report("Protobuf compatibility", `No breaking protobuf changes detected against \`${sha}\`.`);
  } else if (result.status === 100) {
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log(
        "::warning title=Protobuf compatibility advisory::Breaking protobuf changes detected; see the job summary.",
      );
    }
    const details = output
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
    report(
      "Protobuf compatibility advisory",
      `Breaking protobuf changes detected against \`${sha}\`. This advisory does not block the pull request.\n\n${details}`,
    );
  } else {
    throw new Error(`Buf comparison failed (exit ${result.status}).\n${output}`);
  }
}

try {
  main();
} catch (error) {
  report("Protobuf compatibility check failed", error.message);
  process.exitCode = 1;
}
