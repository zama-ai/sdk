#!/usr/bin/env node
// Installs claude-setup/ into the gitignored .claude/, only with the user's consent.
//   pnpm setup:claude               copy from this checkout; .githooks then report updates on TRUSTED_REF
//   pnpm setup:claude --auto-sync   same, and .githooks apply those updates themselves
//   pnpm setup:claude --sync        copy from TRUSTED_REF now
//   pnpm setup:claude --off         stop update reports and automatic updates
//   --first-run (from `prepare`) asks once on the terminal; --hook (from .githooks) reports or applies updates.
// Updates read claude-setup/ from TRUSTED_REF, not the checked-out branch, so a branch under review can't
// install its own agent config through them. Automatic updates skip files they didn't write or that were changed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const ROOT = git("rev-parse", "--show-toplevel").toString().trim();
const TARGET = join(ROOT, ".claude");
// The claude-setup/ tree last installed, which hooks compare to detect updates, and the hash of each file
// written, so automatic updates can leave alone any file that no longer matches.
const MANIFEST = join(TARGET, ".claude-setup.json");

const sha = (data) => createHash("sha256").update(data).digest("hex");

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

function currentMode() {
  try {
    return git("config", MODE_KEY).toString().trim();
  } catch {
    return "";
  }
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { source: null, files: {} };
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

// With `protect`, a file is only written or removed if it is missing or still matches what we last wrote.
function install(files, source, { protect }) {
  const previous = readManifest().files;
  const next = { source, files: {} };
  const skipped = [];
  let changed = 0;
  for (const { path, data, mode } of files) {
    const rel = path.slice(SOURCE.length + 1);
    const dst = join(TARGET, rel);
    const onDisk = existsSync(dst) ? sha(readFileSync(dst)) : null;
    const content = rel === "settings.json" ? mergedSettings(dst, data) : data;
    if (protect && onDisk && onDisk !== previous[rel] && onDisk !== sha(content)) {
      next.files[rel] = previous[rel];
      skipped.push(rel);
      continue;
    }
    if (rel === "settings.json") {
      warnDroppedHooks(dst, content);
    }
    changed += writeIfChanged(dst, content, mode) ? 1 : 0;
    next.files[rel] = sha(content);
  }
  for (const [rel, written] of Object.entries(previous)) {
    const dst = join(TARGET, rel);
    if (rel in next.files || !existsSync(dst)) {
      continue;
    }
    if (protect && sha(readFileSync(dst)) !== written) {
      skipped.push(rel);
      continue;
    }
    remove(dst);
    changed++;
  }
  mkdirSync(TARGET, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + "\n");
  console.log(`✅ .claude/ updated (${changed} files changed)`);
  for (const rel of skipped) {
    console.log(
      `  ⚠️  Kept your version of .claude/${rel}. Run pnpm setup:claude --sync to replace it.`,
    );
  }
}

function installPlugins() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    console.log("⚠️  Claude Code CLI not found. Install it first, then run:");
    console.log("  claude plugin marketplace add zama-ai/zama-marketplace");
    console.log("  claude plugin install zama-developer@zama-marketplace --scope project");
    return;
  }
  execFileSync("claude", ["plugin", "marketplace", "add", "zama-ai/zama-marketplace"], {
    stdio: "inherit",
  });
  execFileSync(
    "claude",
    ["plugin", "install", "zama-developer@zama-marketplace", "--scope", "project"],
    { stdio: "inherit" },
  );
  // The install rewrites settings.json; record it so automatic updates don't take it for a user edit.
  const manifest = readManifest();
  manifest.files["settings.json"] = sha(readFileSync(join(TARGET, "settings.json")));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

function setUp({ fromRef, auto }) {
  const ref = fromRef ? TRUSTED_REF : "HEAD";
  install(fromRef ? filesAtRef(TRUSTED_REF) : filesInCheckout(), sourceTree(ref), {
    protect: false,
  });
  const mode = auto || currentMode() === "auto" ? "auto" : "notify";
  git("config", MODE_KEY, mode);
  console.log(
    mode === "auto"
      ? `✅ Git hooks will apply ${SOURCE}/ updates from ${TRUSTED_REF}.`
      : `✅ Git hooks will tell you when ${SOURCE}/ changes on ${TRUSTED_REF}.`,
  );
}

function ask(tty, question) {
  writeSync(tty, question);
  const buffer = Buffer.alloc(64);
  try {
    const length = readSync(tty, buffer, 0, buffer.length, null);
    return /^y(es)?$/i.test(buffer.toString("utf8", 0, length).split("\n")[0].trim());
  } catch {
    return false;
  }
}

function firstRun() {
  if (currentMode() || process.env.CI) {
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
  const wanted = ask(
    tty,
    "\nInstall the Zama Claude Code config (skills, hooks) into .claude/? [y/N] ",
  );
  const auto =
    wanted &&
    ask(tty, `Apply updates from ${TRUSTED_REF} automatically after checkout and pull? [y/N] `);
  closeSync(tty);
  if (!wanted) {
    git("config", MODE_KEY, "off");
    console.log("Skipped. Run pnpm setup:claude any time to install it.");
    return;
  }
  setUp({ fromRef: true, auto });
  installPlugins();
}

function runHook() {
  const mode = currentMode();
  if (mode !== "notify" && mode !== "auto") {
    return;
  }
  let source;
  try {
    source = sourceTree(TRUSTED_REF);
  } catch {
    return;
  }
  if (readManifest().source === source) {
    return;
  }
  if (mode === "notify") {
    console.log(
      `ℹ️  ${SOURCE}/ changed on ${TRUSTED_REF}. Run pnpm setup:claude --sync to update .claude/.`,
    );
    return;
  }
  try {
    install(filesAtRef(TRUSTED_REF), source, { protect: true });
  } catch (error) {
    // The post-checkout hook's exit status becomes the exit status of git checkout.
    console.log(`⚠️  Could not update .claude/ from ${TRUSTED_REF}: ${error.message}`);
  }
}

const args = new Set(process.argv.slice(2));
if (args.has("--first-run")) {
  firstRun();
} else if (args.has("--hook")) {
  runHook();
} else if (args.has("--off")) {
  git("config", MODE_KEY, "off");
  console.log("✅ Git hooks will no longer report or apply claude-setup/ updates.");
} else if (args.has("--sync")) {
  setUp({ fromRef: true, auto: args.has("--auto-sync") });
} else {
  setUp({ fromRef: false, auto: args.has("--auto-sync") });
  installPlugins();
}
