#!/usr/bin/env node
// The pre-push review saves its report as .git/zama-review/<tree of HEAD>.md.
// A commit counts as reviewed when a report exists for its tree.
//
//   node scripts/review/stamp.mjs write <report.md>   # last step of the pre-push-review skill
//   node scripts/review/stamp.mjs check               # husky pre-push: warns, never blocks
//   node scripts/review/stamp.mjs gate                # Claude Code PreToolUse hook: blocks the push

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** True when a shell command pushes commits or opens a pull request. */
export function isPushCommand(command) {
  return /(?:^|[\s;&|(])(?:git(?:\s+-C\s+\S+)?\s+push|gh\s+pr\s+create)(?=[\s;&|)]|$)/.test(
    command,
  );
}

function reportPath(cwd) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  const dir = path.resolve(cwd, git("rev-parse", "--git-common-dir"), "zama-review");
  return path.join(dir, `${git("rev-parse", "HEAD^{tree}")}.md`);
}

function main([mode, file]) {
  if (mode === "write") {
    const target = reportPath(process.cwd());
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
    console.log(target);
    return 0;
  }

  if (mode === "check") {
    if (!existsSync(reportPath(process.cwd()))) {
      console.warn(
        "⚠️  No pre-push review for HEAD. Run /pre-push-review in Claude Code before you open the PR.",
      );
    }
    return 0;
  }

  if (mode === "gate") {
    const input = JSON.parse(readFileSync(0, "utf8"));
    if (!isPushCommand(input.tool_input?.command ?? "")) {
      return 0;
    }
    let target;
    try {
      target = reportPath(input.cwd);
    } catch {
      return 0;
    }
    if (existsSync(target)) {
      return 0;
    }
    process.stderr.write(
      "No pre-push review for this commit. Run the pre-push-review skill, commit its fixes, then push again. " +
        "A report is needed for every new tree, so rebase or amend before you review, not after. " +
        "If the user wants to push without a review, they can run `! git push` themselves.\n",
    );
    return 2;
  }

  console.error("usage: stamp.mjs write <report.md> | check | gate");
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
