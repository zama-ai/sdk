#!/usr/bin/env node
// Rebuilds the LLM docs in each checkout where Claude edited a docs source this turn, so CI's `llm:check` cannot fail
// on stale artifacts. The pre-commit hook does the same, but git skips it in a worktree without `pnpm install`.
// Exit code 2 tells Claude to commit the regenerated files.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ARTIFACTS = ["llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"];

const input = JSON.parse(readFileSync(0, "utf8"));
const marker = path.join(tmpdir(), `claude-llm-${input.session_id}`);
if (!existsSync(marker)) {
  process.exit(0);
}
// Already blocked once this turn: let Claude stop instead of looping, and keep the marker for the next turn.
if (input.stop_hook_active) {
  process.exit(0);
}

const roots = new Set(readFileSync(marker, "utf8").split("\n").filter(Boolean));
rmSync(marker);

const read = (root) => ARTIFACTS.map((file) => readFileSync(path.join(root, file), "utf8"));

const messages = [];
for (const root of roots) {
  const before = read(root);
  // Run the script directly: `pnpm llm:build` refuses to start when node_modules is out of date with the lockfile.
  const result = spawnSync(process.execPath, ["scripts/llm/build-llms.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(root, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}`,
    },
  });
  if (result.status !== 0) {
    messages.push(
      `${root}: LLM docs rebuild failed:\n${(result.stdout + result.stderr).slice(-4000)}`,
    );
    continue;
  }
  const after = read(root);
  const changed = ARTIFACTS.filter((_, i) => before[i] !== after[i]);
  if (changed.length > 0) {
    messages.push(
      `${root}: regenerated ${changed.join(", ")} from the docs you edited. Commit them with the docs change.`,
    );
  }
}

if (messages.length > 0) {
  process.stderr.write(messages.join("\n"));
  process.exit(2);
}
