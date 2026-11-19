#!/usr/bin/env node
// Typechecks each checkout where Claude edited TypeScript this turn. Exit code 2 makes Claude fix the errors first.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const marker = path.join(tmpdir(), `claude-typecheck-${input.session_id}`);
if (!existsSync(marker)) {
  process.exit(0);
}
// Already blocked once this turn: let Claude stop instead of looping, and keep the marker for the next turn.
if (input.stop_hook_active) {
  process.exit(0);
}

const roots = new Set(readFileSync(marker, "utf8").split("\n").filter(Boolean));
rmSync(marker);

const errors = [];
for (const root of roots) {
  const result = spawnSync("pnpm", ["typecheck"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    // Tail only: the errors are at the end, and the full output floods Claude's context.
    errors.push(`${root}:\n${(result.stdout + result.stderr).slice(-8000)}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(errors.join("\n"));
  process.exit(2);
}
