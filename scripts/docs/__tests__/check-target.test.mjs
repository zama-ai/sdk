import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

// findUrlProblems (the pure core) is exercised in retarget.test.mjs. Here we cover
// check-target's `main()` end-to-end over a tmp fixture — the corpus.config.json
// rawGithubBaseUrl assertion and the non-publish-branch skip path (a pre-existing
// coverage gap) — by running the real script with cwd = the fixture.

const testDir = dirname(fileURLToPath(import.meta.url));
const CHECK_TARGET = join(testDir, "..", "check-target.mjs");

const createdDirs = [];

function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "check-target-it-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function write(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const SPACE_LINK = {
  stable: "https://docs.zama.org/protocol/sdk/guides/x.md",
  alpha: "https://docs.zama.org/protocol/sdk/alpha/guides/x.md",
};

/** A minimal fixture: check-target only needs one doc page under docs/gitbook/src and
 *  corpus.config.json's rawGithubBaseUrl (it does not run the full corpus validation). */
function makeFixture(root, { branch, link }) {
  write(
    root,
    "docs/llm/corpus.config.json",
    `${JSON.stringify(
      { rawGithubBaseUrl: `https://raw.githubusercontent.com/zama-ai/sdk/${branch}` },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    "docs/gitbook/src/overview.md",
    `---\ntitle: Overview\n---\n\n# Overview\n\nSee [x](${SPACE_LINK[link]}).\n`,
  );
}

function runCheckTarget(cwd, arg) {
  const args = arg === undefined ? [] : [arg];
  return spawnSync("node", [CHECK_TARGET, ...args], { cwd, encoding: "utf8" });
}

describe("check-target main() — end to end", () => {
  test("passes when doc space and rawGithubBaseUrl both target the branch", () => {
    const dir = freshDir();
    makeFixture(dir, { branch: "main", link: "stable" });
    const res = runCheckTarget(dir, "main");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("stable");
  });

  test("clean prerelease fixture passes", () => {
    const dir = freshDir();
    makeFixture(dir, { branch: "prerelease", link: "alpha" });
    const res = runCheckTarget(dir, "prerelease");
    expect(res.status).toBe(0);
  });

  test("fails when a doc links to the wrong (alpha) GitBook space for main", () => {
    const dir = freshDir();
    makeFixture(dir, { branch: "main", link: "alpha" });
    const res = runCheckTarget(dir, "main");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("alpha");
    expect(res.stderr).toContain("overview.md");
  });

  test("fails on the corpus.config.json rawGithubBaseUrl assertion when it targets the other branch", () => {
    const dir = freshDir();
    // Docs are clean-stable (good for main) but the config still points at prerelease —
    // isolates the rawGithubBaseUrl check from the per-file space check.
    makeFixture(dir, { branch: "prerelease", link: "stable" });
    const res = runCheckTarget(dir, "main");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("corpus.config.json");
    expect(res.stderr).toContain("rawGithubBaseUrl");
  });
});

describe("check-target main() — non-publish-branch skip path", () => {
  test("a feature branch is skipped (exit 0, no assertions) — even with no docs tree", () => {
    // The skip happens before any file read, so an empty cwd is enough.
    const res = runCheckTarget(freshDir(), "feature/x");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("skipping");
  });

  test("a missing target argument is skipped rather than erroring", () => {
    const res = runCheckTarget(freshDir(), undefined);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("skipping");
  });

  test("a trailing-slash rawGithubBaseUrl still satisfies the branch assertion", () => {
    // The assertion strips trailing slashes before comparing — pin that so a config
    // written as `.../sdk/main/` doesn't spuriously fail a main check.
    const dir = freshDir();
    write(
      dir,
      "docs/llm/corpus.config.json",
      `${JSON.stringify(
        { rawGithubBaseUrl: "https://raw.githubusercontent.com/zama-ai/sdk/main/" },
        null,
        2,
      )}\n`,
    );
    write(dir, "docs/gitbook/src/overview.md", `# Overview\n\nSee [x](${SPACE_LINK.stable}).\n`);
    const res = runCheckTarget(dir, "main");
    expect(res.status).toBe(0);
  });
});
