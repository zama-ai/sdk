#!/usr/bin/env node
// Formats and lints the file Claude just edited. Exit code 2 sends the errors back to Claude.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!file || !file.startsWith(cwd)) {
  process.exit(0);
}

const run = (...args) =>
  spawnSync("pnpm", ["exec", ...args], { cwd, encoding: "utf8", stdio: "pipe" });

run("oxfmt", "--no-error-on-unmatched-pattern", file);

if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) {
  process.exit(0);
}

const failures = [
  run("oxlint", "--fix", "--no-error-on-unmatched-pattern", file),
  run("ast-grep", "scan", "--config", "sgconfig.yml", file),
].filter((result) => result.status !== 0);

if (failures.length > 0) {
  process.stderr.write(failures.map((result) => result.stdout + result.stderr).join("\n"));
  process.exit(2);
}
