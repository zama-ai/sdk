#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REVIEWED_TREE_TRAILER = "Pre-push-review";
const HOW_TO_FIX =
  "Run the pre-push-review skill in Claude Code; it reviews the branch, fixes findings and adds the trailer.";

export function isPushOrPrCreate(command) {
  const unquoted = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
  return /(?:^|[\s;&|(])(?:\S*\/)?(?:git(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+push|gh\s+pr(?:\s+(?:-R|--repo)(?:=|\s+)\S+)?\s+create)(?=[\s;&|)]|$)/.test(
    unquoted,
  );
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function headIsReviewed(cwd) {
  const tree = git(cwd, "rev-parse", "HEAD^{tree}");
  return (
    git(cwd, "log", "-1", `--format=%(trailers:key=${REVIEWED_TREE_TRAILER},valueonly)`) === tree
  );
}

function main([mode, flag]) {
  if (mode === "write") {
    const tree = git(process.cwd(), "rev-parse", "HEAD^{tree}");
    execFileSync(
      "git",
      [
        "-c",
        "trailer.ifexists=replace",
        "commit",
        "--amend",
        "--only",
        "--no-edit",
        "--trailer",
        `${REVIEWED_TREE_TRAILER}: ${tree}`,
      ],
      { stdio: "inherit" },
    );
    return 0;
  }

  if (mode === "check") {
    if (headIsReviewed(process.cwd())) {
      return 0;
    }
    if (flag === "--strict") {
      console.error(`HEAD has no ${REVIEWED_TREE_TRAILER} trailer for its tree. ${HOW_TO_FIX}`);
      return 1;
    }
    console.warn(`⚠️  HEAD has no pre-push review. ${HOW_TO_FIX}`);
    return 0;
  }

  if (mode === "gate") {
    const input = JSON.parse(readFileSync(0, "utf8"));
    if (!isPushOrPrCreate(input.tool_input?.command ?? "")) {
      return 0;
    }
    // No repository or no commits yet: there is nothing to review, and CI still checks the PR.
    try {
      if (headIsReviewed(input.cwd)) {
        return 0;
      }
    } catch {
      return 0;
    }
    process.stderr.write(
      `No pre-push review for this commit. ${HOW_TO_FIX} Rebase before you review, not after.` +
        " If the user wants to push without a review, they can run `! git push` themselves.\n",
    );
    return 2;
  }

  console.error("usage: stamp.mjs write | check [--strict] | gate");
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
