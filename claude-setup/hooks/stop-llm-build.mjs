#!/usr/bin/env node
// Rebuilds the LLM docs in each checkout where Claude edited a docs source this turn, so CI's `llm:check` cannot fail
// on stale artifacts. The pre-commit hook does the same, but not in a worktree without `pnpm install` or with `--no-verify`.
// Exit code 2 sends the result back to Claude: commit the regenerated files, or fix the failed build.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = JSON.parse(readFileSync(0, "utf8"));
const marker = path.join(tmpdir(), `claude-llm-${input.session_id}`);
if (!existsSync(marker)) {
  process.exit(0);
}

const roots = new Set(readFileSync(marker, "utf8").split("\n").filter(Boolean));
rmSync(marker);

const messages = [];
for (const root of roots) {
  const lib = path.join(root, "scripts/llm/lib/artifacts.mjs");
  if (!existsSync(lib)) {
    continue;
  }
  const { LLM_ARTIFACTS } = await import(pathToFileURL(lib).href);
  // Run the script directly: `pnpm llm:build` refuses to start when node_modules is out of date with the lockfile.
  const result = spawnSync(process.execPath, ["scripts/llm/build-llms.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    messages.push(
      `${root}: LLM docs rebuild failed. Fix the error below, then run \`node scripts/llm/build-llms.mjs\` in that checkout:\n${(result.stdout + result.stderr).slice(-4000)}`,
    );
    continue;
  }
  const changed = spawnSync("git", ["status", "--porcelain", "--", ...LLM_ARTIFACTS], {
    cwd: root,
    encoding: "utf8",
  })
    .stdout.split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
  if (changed.length > 0) {
    messages.push(
      `${root}: regenerated ${changed.join(", ")}. Include them in the same commit as the source change so llm:check passes.`,
    );
  }
}

if (messages.length > 0) {
  process.stderr.write(messages.join("\n"));
  process.exit(2);
}
