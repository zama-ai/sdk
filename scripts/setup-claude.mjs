#!/usr/bin/env node
// Copies claude-setup/ into .claude/.
//   pnpm setup:claude                       from this checkout; opts in to the sync below
//   node scripts/setup-claude.mjs --sync    from TRUSTED_REF; .githooks run this after checkout and merge
// The sync reads claude-setup/ from TRUSTED_REF, not the checked-out branch, so a branch under review
// can't install its own agent config through it.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const TRUSTED_REF = "origin/beta";
const SOURCE = "claude-setup";
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const ROOT = git("rev-parse", "--show-toplevel").toString().trim();
const TARGET = join(ROOT, ".claude");
// Lists the files the last run copied, so files removed from claude-setup/ are removed here too.
const MANIFEST = join(TARGET, ".claude-setup-files");

function merge(a, b) {
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = k in a ? merge(a[k], b[k]) : b[k];
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...new Set([...a, ...b])];
  }
  return b;
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function hookCommands(hooks) {
  return Object.values(hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? hook.type)),
  );
}

function lines(buffer) {
  return buffer.toString().split("\0").filter(Boolean);
}

function filesAtRef(ref) {
  return lines(git("ls-tree", "-r", "-z", ref, "--", SOURCE)).map((entry) => {
    const [meta, path] = entry.split("\t");
    const [mode, , sha] = meta.split(" ");
    return { path, data: git("cat-file", "blob", sha), mode: mode === "100755" ? 0o755 : 0o644 };
  });
}

function filesInCheckout() {
  return lines(git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", SOURCE))
    .filter((path) => existsSync(join(ROOT, path)))
    .map((path) => {
      const full = join(ROOT, path);
      return { path, data: readFileSync(full), mode: statSync(full).mode & 0o777 };
    });
}

function writeSettings(data) {
  const dst = join(TARGET, "settings.json");
  const template = JSON.parse(data.toString());
  const current = existsSync(dst) ? JSON.parse(readFileSync(dst, "utf8")) : {};
  // Hook entries are objects, so unioning them would keep superseded hooks running.
  const merged = { ...merge(current, template), hooks: template.hooks };
  const kept = new Set(hookCommands(template.hooks));
  for (const command of hookCommands(current.hooks).filter((c) => !kept.has(c))) {
    console.log(`  ⚠️  Removed a hook that is not in the template: ${command}`);
    console.log("     Put personal hooks in .claude/settings.local.json to keep them.");
  }
  return writeIfChanged(dst, Buffer.from(JSON.stringify(merged, null, 2) + "\n"));
}

function writeIfChanged(dst, data, mode = 0o644) {
  if (existsSync(dst) && readFileSync(dst).equals(data) && (statSync(dst).mode & 0o777) === mode) {
    return false;
  }
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, data);
  chmodSync(dst, mode);
  return true;
}

const sync = process.argv.includes("--sync");

let files;
try {
  files = sync ? filesAtRef(TRUSTED_REF) : filesInCheckout();
} catch (error) {
  if (!sync) {
    throw error;
  }
  // Exit 0: a post-checkout hook's exit status becomes the exit status of git checkout.
  console.log(`⚠️  Could not read ${SOURCE}/ at ${TRUSTED_REF}; .claude/ was not synced.`);
  process.exit(0);
}

let changed = 0;
const copied = [];
for (const { path, data, mode } of files) {
  const rel = path.slice(SOURCE.length + 1);
  copied.push(rel);
  if (
    rel === "settings.json" ? writeSettings(data) : writeIfChanged(join(TARGET, rel), data, mode)
  ) {
    changed++;
  }
}
const previous = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8").split("\n") : [];
for (const rel of previous.filter((p) => p && p !== "settings.json" && !copied.includes(p))) {
  if (existsSync(join(TARGET, rel))) {
    unlinkSync(join(TARGET, rel));
    for (let dir = dirname(join(TARGET, rel)); dir !== TARGET && readdirSync(dir).length === 0;) {
      rmdirSync(dir);
      dir = dirname(dir);
    }
    changed++;
  }
}
writeFileSync(MANIFEST, copied.join("\n") + "\n");

if (changed > 0 || !sync) {
  console.log(
    `✅ .claude/ synced from ${sync ? TRUSTED_REF : "this checkout"} (${changed} files changed)`,
  );
}

if (sync) {
  process.exit(0);
}

git("config", "zama.claudeSetup", "true");
console.log(
  `✅ Opted in: .githooks keep .claude/ in sync with ${TRUSTED_REF} after checkout and merge.`,
);

try {
  execFileSync("claude", ["--version"], { stdio: "ignore" });
} catch {
  console.log("⚠️  Claude Code CLI not found. Install it first, then run:");
  console.log("  claude plugin marketplace add zama-ai/zama-marketplace");
  console.log("  claude plugin install zama-developer@zama-marketplace --scope project");
  process.exit(0);
}

execFileSync("claude", ["plugin", "marketplace", "add", "zama-ai/zama-marketplace"], {
  stdio: "inherit",
});
execFileSync(
  "claude",
  ["plugin", "install", "zama-developer@zama-marketplace", "--scope", "project"],
  { stdio: "inherit" },
);
