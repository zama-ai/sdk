import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real script against a real repo, so the git call itself is covered,
// not just the diff parser.
const SCRIPT = fileURLToPath(new URL("../no-em-dash.mjs", import.meta.url));
const EM_DASH = "\u2014";

let repo;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const check = (cwd = repo) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "no-em-dash-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(repo, "README.md"), "start\n");
  git("add", ".");
  git("commit", "-qm", "init");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("no-em-dash CLI", () => {
  it("sees staged changes at the root when run from a subdirectory", () => {
    mkdirSync(join(repo, "sub"));
    writeFileSync(join(repo, "root.md"), `a ${EM_DASH} b\n`);
    git("add", "root.md");

    const result = check(join(repo, "sub"));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^root\.md:1:/m);
  });

  it("prints repo paths even with diff.mnemonicPrefix set", () => {
    git("config", "diff.mnemonicPrefix", "true");
    writeFileSync(join(repo, "a.md"), `a ${EM_DASH} b\n`);
    git("add", "a.md");

    const result = check();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^a\.md:1:/m);
  });

  it("reads the real file content when a textconv driver is set", () => {
    writeFileSync(join(repo, ".gitattributes"), "*.md diff=blank\n");
    git("config", "diff.blank.textconv", "true");
    git("add", ".gitattributes");
    git("commit", "-qm", "attributes");
    writeFileSync(join(repo, "a.md"), `a ${EM_DASH} b\n`);
    git("add", "a.md");

    const result = check();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^a\.md:1:/m);
  });
});
