#!/usr/bin/env node
// Typechecks before Claude ends its turn. Exit code 2 makes Claude fix the errors first.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Already blocked once this turn: let Claude stop instead of looping.
if (input.stop_hook_active) {
  process.exit(0);
}

const status = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
if (!/\.(ts|tsx)$/m.test(status.stdout)) {
  process.exit(0);
}

const result = spawnSync("pnpm", ["typecheck"], { cwd, encoding: "utf8", stdio: "pipe" });
if (result.status !== 0) {
  process.stderr.write((result.stdout + result.stderr).slice(-8000));
  process.exit(2);
}
