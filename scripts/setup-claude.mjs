#!/usr/bin/env node
// Installs claude-setup/ into the gitignored .claude/.
//   pnpm setup:claude          copy from this checkout
//   pnpm setup:claude --sync   copy from TRUSTED_REF (both also install the plugins)
//   pnpm setup:claude --off    stop the update reports from the git hooks
//   --first-run (from `prepare`) installs the git hooks and asks once on the terminal.
//   --hooks (from .husky/) moves installs that still use husky to these git hooks.
// --sync, --first-run and the hook reports read claude-setup/ from TRUSTED_REF, not the checked-out branch. The
// checkout and merge hooks live in the git dir, not the working tree, so checking out a branch under review runs
// none of its code.

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
const SOURCE_MARK = ".claude/.claude-setup-source";
// A branch can force-add files under the gitignored .claude/, which Claude Code would then load.
const WARN = `git ls-files --error-unmatch .claude >/dev/null 2>&1 &&
  echo "⚠️  This branch commits files under .claude/. Review them before you run Claude Code here."
`;
const REPORT = `[ "$(git config ${MODE_KEY})" = notify ] || exit 0
tree=$(git rev-parse -q --verify ${TRUSTED_REF}:${SOURCE}) || exit 0
[ -f ${SOURCE_MARK} ] || {
  echo "ℹ️  .claude/ is not set up in this worktree. Run pnpm setup:claude --sync, or pnpm setup:claude --off to stop these reports."
  exit 0
}
[ "$(cat ${SOURCE_MARK})" = "$tree" ] ||
  echo "ℹ️  ${SOURCE}/ changed on ${TRUSTED_REF}. Run pnpm setup:claude --sync to update .claude/."
exit 0
`;
// pre-commit runs the branch's own checks, which committing to a branch already trusts.
const HOOKS = {
  "pre-commit": `#!/bin/sh
[ -x .githooks/pre-commit ] || exit 0
exec .githooks/pre-commit "$@"
`,
  // $3 is 1 for a branch checkout (including git worktree add) and 0 for a file checkout.
  "post-checkout": `#!/bin/sh
[ "$3" = "1" ] || exit 0
${WARN}${REPORT}`,
  "post-merge": `#!/bin/sh
${WARN}${REPORT}`,
};
// The files the last install wrote, so the next one can remove the ones the source dropped.
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
  try {
    return git("rev-parse", "-q", "--verify", `${ref}:${SOURCE}`).toString().trim();
  } catch (error) {
    if (error.status !== 1) {
      throw error;
    }
    return null;
  }
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
    return { files: [] };
  }
}

function settingsFor(dst, data) {
  const template = JSON.parse(data.toString());
  const current = existsSync(dst) ? JSON.parse(readFileSync(dst, "utf8")) : {};
  const kept = new Set(hookCommands(template.hooks));
  for (const command of hookCommands(current.hooks).filter((c) => !kept.has(c))) {
    console.log(`  ⚠️  Removed a hook that is not in the template: ${command}`);
    console.log("     Put personal hooks in .claude/settings.local.json to keep them.");
  }
  // Hook entries are objects, so unioning them would keep superseded hooks running.
  const merged = { ...merge(current, template), hooks: template.hooks };
  return Buffer.from(JSON.stringify(merged, null, 2) + "\n");
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

function install(files, tree) {
  const items = files.map((file) => ({ ...file, rel: file.path.slice(SOURCE.length + 1) }));
  const written = items.map(({ rel }) => rel);
  const changes = [];
  // Drop first so a path that changes between file and directory does not collide with the new one.
  for (const dropped of readManifest().files.filter((rel) => !written.includes(rel))) {
    if (existsSync(join(TARGET, dropped))) {
      remove(join(TARGET, dropped));
      changes.push(`removed ${dropped}`);
    }
  }
  for (const { rel, data, mode } of items) {
    const dst = join(TARGET, rel);
    const content = rel === "settings.json" ? settingsFor(dst, data) : data;
    if (writeIfChanged(dst, content, mode)) {
      changes.push(`updated ${rel}`);
    }
  }
  mkdirSync(TARGET, { recursive: true });
  writeFileSync(join(ROOT, SOURCE_MARK), tree + "\n");
  writeFileSync(MANIFEST, JSON.stringify({ files: written }, null, 2) + "\n");
  console.log(
    changes.length
      ? `✅ .claude/ updated (${changes.length} changed)`
      : "✅ .claude/ is up to date",
  );
  for (const change of changes) {
    console.log(`  ${change}`);
  }
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

function installHooks() {
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir").toString().trim();
  const dir = join(common, "zama-hooks");
  for (const [name, body] of Object.entries(HOOKS)) {
    writeIfChanged(join(dir, name), Buffer.from(body), 0o755);
  }
  git("config", "core.hooksPath", dir);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const trusted = () => ({
  tree:
    sourceTree(TRUSTED_REF) ??
    fail(`${TRUSTED_REF} has no ${SOURCE}/. Run git fetch origin, then retry.`),
  files: filesAtRef(TRUSTED_REF),
});

// Uncommitted edits to claude-setup/ get a marker that never equals a tree, so the hook reports a difference.
const checkout = () => ({
  tree: git("status", "--porcelain", "--", SOURCE).length
    ? "worktree"
    : (sourceTree("HEAD") ?? fail(`HEAD has no ${SOURCE}/.`)),
  files: filesInCheckout(),
});

function setUp({ tree, files }) {
  // `pnpm install --ignore-scripts` skips `prepare`, which otherwise installs the git hooks.
  installHooks();
  install(files, tree);
  git("config", MODE_KEY, "notify");
  console.log(`✅ Git hooks will tell you when ${SOURCE}/ changes on ${TRUSTED_REF}.`);
  installPlugins();
}

function firstRun() {
  installHooks();
  if (gitConfig(MODE_KEY) || process.env.CI || !sourceTree(TRUSTED_REF)) {
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
  setUp(trusted());
}

const COMMANDS = {
  "": () => setUp(checkout()),
  "--first-run": firstRun,
  "--hooks": installHooks,
  "--off": () => {
    git("config", MODE_KEY, "off");
    console.log("✅ Git hooks will no longer report claude-setup/ updates.");
  },
  "--sync": () => setUp(trusted()),
};

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !Object.hasOwn(COMMANDS, args[0]))) {
  console.error(`Unknown arguments: ${args.join(" ")}`);
  console.error("Usage: setup-claude.mjs [--sync | --off | --first-run | --hooks]");
  process.exit(2);
}
COMMANDS[args[0] ?? ""]();
