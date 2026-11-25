#!/usr/bin/env node
// Installs claude-setup/ into the gitignored .claude/.
//   pnpm setup:claude          copy from this checkout and install the plugins
//   pnpm setup:claude --sync   copy from TRUSTED_REF
//   pnpm setup:claude --off    stop the update reports from .githooks
//   --first-run (from `prepare`) asks once on the terminal; --hook (from .githooks) reports updates on TRUSTED_REF.
// Updates read claude-setup/ from TRUSTED_REF, not the checked-out branch, so a branch under review can't
// install its own agent config through them.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

const TRUSTED_REF = "origin/beta";
const SOURCE = "claude-setup";
const MODE_KEY = "zama.claudeSetup";
const PLUGINS = [
  ["zama-ai/zama-marketplace", "zama-developer@zama-marketplace"],
  ["zama-ai/skills", "zama-protocol@zama-skills"],
];
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const ROOT = git("rev-parse", "--show-toplevel").toString().trim();
const TARGET = join(ROOT, ".claude");
// The claude-setup/ tree last installed, which the hook compares with TRUSTED_REF, and the files it wrote,
// so the next install can remove the ones the source dropped.
const MANIFEST = join(TARGET, ".claude-setup.json");

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

function entries(buffer) {
  return buffer.toString().split("\0").filter(Boolean);
}

function filesAtRef(ref) {
  return entries(git("ls-tree", "-r", "-z", ref, "--", SOURCE)).map((entry) => {
    const [meta, path] = entry.split("\t");
    const [mode, , blob] = meta.split(" ");
    return { path, data: git("cat-file", "blob", blob), mode: mode === "100755" ? 0o755 : 0o644 };
  });
}

function filesInCheckout() {
  return entries(git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", SOURCE))
    .filter((path) => existsSync(join(ROOT, path)))
    .map((path) => {
      const full = join(ROOT, path);
      return { path, data: readFileSync(full), mode: statSync(full).mode & 0o777 };
    });
}

function sourceTree(ref) {
  return git("rev-parse", "-q", "--verify", `${ref}:${SOURCE}`).toString().trim();
}

function gitConfig(key) {
  try {
    return git("config", key).toString().trim();
  } catch {
    return "";
  }
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { source: null, files: [] };
  }
}

function mergedSettings(dst, data) {
  const template = JSON.parse(data.toString());
  const current = existsSync(dst) ? JSON.parse(readFileSync(dst, "utf8")) : {};
  // Hook entries are objects, so unioning them would keep superseded hooks running.
  const merged = { ...merge(current, template), hooks: template.hooks };
  return Buffer.from(JSON.stringify(merged, null, 2) + "\n");
}

function warnDroppedHooks(dst, content) {
  if (!existsSync(dst)) {
    return;
  }
  const kept = new Set(hookCommands(JSON.parse(content.toString()).hooks));
  const current = JSON.parse(readFileSync(dst, "utf8")).hooks;
  for (const command of hookCommands(current).filter((c) => !kept.has(c))) {
    console.log(`  ⚠️  Removed a hook that is not in the template: ${command}`);
    console.log("     Put personal hooks in .claude/settings.local.json to keep them.");
  }
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

function remove(dst) {
  unlinkSync(dst);
  for (let dir = dirname(dst); dir !== TARGET && readdirSync(dir).length === 0;) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

function install(files, source) {
  const previous = readManifest().files;
  const written = [];
  let changed = 0;
  for (const { path, data, mode } of files) {
    const rel = path.slice(SOURCE.length + 1);
    const dst = join(TARGET, rel);
    let content = data;
    if (rel === "settings.json") {
      content = mergedSettings(dst, data);
      warnDroppedHooks(dst, content);
    }
    changed += writeIfChanged(dst, content, mode) ? 1 : 0;
    written.push(rel);
  }
  for (const dropped of previous.filter((rel) => !written.includes(rel))) {
    if (existsSync(join(TARGET, dropped))) {
      remove(join(TARGET, dropped));
      changed++;
    }
  }
  mkdirSync(TARGET, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify({ source, files: written }, null, 2) + "\n");
  console.log(`✅ .claude/ updated (${changed} files changed)`);
}

function installPlugins() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    console.log("⚠️  Claude Code CLI not found. Install it first, then run:");
    for (const [marketplace, plugin] of PLUGINS) {
      console.log(`  claude plugin marketplace add ${marketplace}`);
      console.log(`  claude plugin install ${plugin} --scope project`);
    }
    return;
  }
  for (const [marketplace, plugin] of PLUGINS) {
    try {
      execFileSync("claude", ["plugin", "marketplace", "add", marketplace], { stdio: "inherit" });
      execFileSync("claude", ["plugin", "install", plugin, "--scope", "project"], {
        stdio: "inherit",
      });
    } catch {
      // zama-ai/zama-marketplace is internal, so external contributors can't install from it.
      console.log(`⚠️  Could not install ${plugin}; skills from it won't be available.`);
    }
  }
}

function setUp({ fromRef }) {
  // `pnpm install --ignore-scripts` skips `prepare`, which otherwise points git at .githooks/.
  git("config", "core.hooksPath", ".githooks");
  const ref = fromRef ? TRUSTED_REF : "HEAD";
  install(fromRef ? filesAtRef(TRUSTED_REF) : filesInCheckout(), sourceTree(ref));
  git("config", MODE_KEY, "notify");
  console.log(`✅ Git hooks will tell you when ${SOURCE}/ changes on ${TRUSTED_REF}.`);
}

function firstRun() {
  if (gitConfig(MODE_KEY) || process.env.CI) {
    return;
  }
  try {
    sourceTree(TRUSTED_REF);
  } catch {
    return;
  }
  let tty;
  try {
    // pnpm doesn't give lifecycle scripts the terminal's stdin, so ask on the terminal directly.
    tty = openSync("/dev/tty", "r+");
  } catch {
    return;
  }
  writeSync(tty, "\nInstall the Zama Claude Code config (skills, hooks) into .claude/? [y/N] ");
  const buffer = Buffer.alloc(64);
  let answer = "";
  try {
    answer = buffer.toString("utf8", 0, readSync(tty, buffer, 0, buffer.length, null));
  } catch {
    // No answer counts as no.
  }
  closeSync(tty);
  if (!/^y(es)?$/i.test(answer.split("\n")[0].trim())) {
    git("config", MODE_KEY, "off");
    console.log("Skipped. Run pnpm setup:claude any time to install it.");
    return;
  }
  setUp({ fromRef: true });
  installPlugins();
}

function runHook() {
  if (gitConfig(MODE_KEY) !== "notify") {
    return;
  }
  try {
    if (readManifest().source !== sourceTree(TRUSTED_REF)) {
      console.log(
        `ℹ️  ${SOURCE}/ changed on ${TRUSTED_REF}. Run pnpm setup:claude --sync to update .claude/.`,
      );
    }
  } catch {
    // The post-checkout hook's exit status becomes the exit status of git checkout.
  }
}

const args = new Set(process.argv.slice(2));
if (args.has("--first-run")) {
  firstRun();
} else if (args.has("--hook")) {
  runHook();
} else if (args.has("--off")) {
  git("config", MODE_KEY, "off");
  console.log("✅ Git hooks will no longer report claude-setup/ updates.");
} else if (args.has("--sync")) {
  setUp({ fromRef: true });
} else {
  setUp({ fromRef: false });
  installPlugins();
}
