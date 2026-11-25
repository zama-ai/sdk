import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../setup-claude.mjs");
// No `claude` on PATH, so setup prints the plugin commands instead of installing plugins.
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  PATH: "/usr/bin:/bin",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
let repo;

const git = (...args) => execFileSync("git", args, { cwd: repo, env }).toString();
const setup = (...args) =>
  execFileSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env }).toString();
// Runs the installed hook the way git does: from the working tree root.
const hook = (name, ...args) =>
  execFileSync(join(repo, ".git", "zama-hooks", name), args, { cwd: repo, env }).toString();
const installed = (rel) => {
  const path = join(repo, ".claude", rel);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

function write(files) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(repo, "claude-setup", rel);
    if (content === null) {
      rmSync(path);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
}

function publish(files) {
  write(files);
  git("add", "-A");
  git("commit", "-qm", "update");
  git("update-ref", "refs/remotes/origin/beta", "HEAD");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "setup-claude-"));
  git("init", "-q");
  writeFileSync(join(repo, ".gitignore"), ".claude/\n");
  publish({ "a.md": "1", "b.md": "1", "c.md": "1" });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("setup-claude", () => {
  it("--sync installs from origin/beta, not the checkout", () => {
    write({ "a.md": "branch" });
    setup("--sync");
    expect(installed("a.md")).toBe("1");
    expect(git("config", "zama.claudeSetup").trim()).toBe("notify");
    expect(git("config", "core.hooksPath").trim()).toBe(
      join(realpathSync(repo), ".git", "zama-hooks"),
    );
  });

  it("--sync without origin/beta asks for a fetch", () => {
    git("update-ref", "-d", "refs/remotes/origin/beta");
    expect(() => setup("--sync")).toThrow(/git fetch origin/);
    expect(installed("a.md")).toBe(null);
  });

  it("plain setup installs from the checkout", () => {
    write({ "a.md": "branch" });
    setup();
    expect(installed("a.md")).toBe("branch");
  });

  it("the hook only reports updates", () => {
    setup("--sync");
    publish({ "a.md": "2" });
    expect(hook("post-merge")).toContain("changed on origin/beta");
    expect(installed("a.md")).toBe("1");
  });

  it("the hook asks a worktree without .claude/ to set it up", () => {
    setup("--sync");
    rmSync(join(repo, ".claude"), { recursive: true });
    expect(hook("post-merge")).toContain("not set up in this worktree");
  });

  it("the hook is quiet when .claude/ is up to date", () => {
    setup("--sync");
    expect(hook("post-merge")).toBe("");
  });

  it("checking out a branch runs none of its hooks", () => {
    setup("--sync");
    git("checkout", "-qb", "evil");
    mkdirSync(join(repo, ".githooks"));
    writeFileSync(join(repo, ".githooks", "post-checkout"), "#!/bin/sh\ntouch pwned\n", {
      mode: 0o755,
    });
    git("add", "-A");
    git("commit", "-qm", "evil");
    git("checkout", "-q", "-");
    git("checkout", "-q", "evil");
    git("worktree", "add", "-q", "--detach", "wt", "evil");
    expect(existsSync(join(repo, "pwned"))).toBe(false);
    expect(existsSync(join(repo, "wt", "pwned"))).toBe(false);
  });

  it("the hooks warn about committed .claude/ files", () => {
    setup("--hooks");
    expect(hook("post-checkout", "a", "b", "1")).toBe("");
    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(join(repo, ".claude", "settings.json"), "{}");
    git("add", "-f", ".claude/settings.json");
    expect(hook("post-checkout", "a", "b", "1")).toContain("commits files under .claude/");
  });

  it("--sync removes files the source dropped", () => {
    setup("--sync");
    publish({ "c.md": null });
    setup("--sync");
    expect(installed("c.md")).toBe(null);
  });

  it("--off stops the reports", () => {
    setup("--sync");
    setup("--off");
    publish({ "a.md": "2" });
    expect(hook("post-merge")).toBe("");
  });
});
