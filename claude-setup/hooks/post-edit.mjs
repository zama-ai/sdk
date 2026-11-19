#!/usr/bin/env node
// Runs the lint-staged commands on the file Claude just edited. Exit code 2 sends the errors back to Claude.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (typeof path.matchesGlob !== "function") {
  process.stderr.write("post-edit hook needs Node >= 22.5 for path.matchesGlob\n");
  process.exit(0);
}

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
if (!file) {
  process.exit(0);
}

// Resolve the checkout from the file, not the session: a worktree has its own config and node_modules.
const root = spawnSync("git", ["-C", path.dirname(file), "rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).stdout?.trim();
const bin = root && path.join(root, "node_modules", ".bin");
const config = root && path.join(root, "lint-staged.config.mjs");
if (!root || !existsSync(bin) || !existsSync(config)) {
  process.exit(0);
}

const name = path.basename(file);
if (/\.[cm]?tsx?$/.test(name)) {
  appendFileSync(path.join(tmpdir(), `claude-typecheck-${input.session_id}`), `${root}\n`);
}

const { default: tasks } = await import(pathToFileURL(config).href);
const failures = [];
for (const [glob, commands] of Object.entries(tasks)) {
  if (!path.matchesGlob(name, glob)) {
    continue;
  }
  for (const command of [commands].flat()) {
    const [tool, ...args] = command.split(" ");
    const executable = tool === "node" ? process.execPath : path.join(bin, tool);
    const result = spawnSync(executable, [...args, file], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      failures.push(result.error?.message ?? result.stdout + result.stderr);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(failures.join("\n"));
  process.exit(2);
}
