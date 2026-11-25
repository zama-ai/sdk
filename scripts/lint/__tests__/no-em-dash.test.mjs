import { describe, expect, it } from "vitest";
import { codeFences, findAddedEmDashes, hasDash } from "../no-em-dash.mjs";

const EM_DASH = "\u2014";

describe("findAddedEmDashes", () => {
  it("reports added lines with their new line numbers", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3,0 +4,2 @@",
      "+// fine",
      `+// bad ${EM_DASH} here`,
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([
      { file: "src/a.ts", line: 5, text: `// bad ${EM_DASH} here` },
    ]);
  });

  it("ignores removed lines", () => {
    const diff = [
      "diff --git a/docs/x.md b/docs/x.md",
      "--- a/docs/x.md",
      "+++ b/docs/x.md",
      "@@ -1 +1 @@",
      `-old ${EM_DASH} line`,
      "+new line",
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([]);
  });

  it("skips a pure rename, a binary file, and the no-newline marker", () => {
    const diff = [
      "diff --git a/old.md b/new.md",
      "similarity index 100%",
      "rename from old.md",
      "rename to new.md",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
      "diff --git a/c.md b/c.md",
      "--- a/c.md",
      "+++ b/c.md",
      "@@ -1 +1 @@",
      "-old",
      `+new ${EM_DASH} end`,
      "\\ No newline at end of file",
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([
      { file: "c.md", line: 1, text: `new ${EM_DASH} end` },
    ]);
  });

  it("does not mistake hunk lines that look like file headers for headers", () => {
    const diff = [
      "diff --git a/q.sql b/q.sql",
      "--- a/q.sql",
      "+++ b/q.sql",
      "@@ -1 +1 @@",
      "--- old comment",
      `+++ new comment ${EM_DASH} here`,
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([
      { file: "q.sql", line: 1, text: `++ new comment ${EM_DASH} here` },
    ]);
  });
});

describe("hasDash", () => {
  // Built from parts so this file doesn't fail its own check.
  it.each([
    ["// fails", "--", "on retry", "a.ts"],
    ["- [`useShield`](./useShield.md)", "--", "recommended path", "a.md"],
    ["The SDK", "\u2013", "for browsers", "a.md"],
    ["Build transactions", "-", "the offline path.", "a.md"],
    ["  // the cache", "-", "not the chain", "a.ts"],
    ["# one workspace", "-", "one lockfile", "a.yml"],
    ["# reruns the build", "--", "slow", "code-fence"],
    ["/** One-liner", "--", "with a stand-in. */", "a.ts"],
    ["/** Starts a block", "-", "on the first line", "a.ts"],
    ["//! Crate docs", "-", "in Rust", "lib.rs"],
    ["- `ConfigurationError`", "-", "invalid request", "a.md"],
    ["- **Bold**", "-", "does a thing", "a.md"],
  ])("flags %j %j %j", (before, dash, after, file) => {
    expect(hasDash(`${before} ${dash} ${after}`, file)).toBe(true);
  });

  it.each([
    // CLI flags and end-of-options in code, comments, and Markdown
    ["git log -- src", "a.sh"],
    ["  run: cargo run -- serve", "ci.yml"],
    ['execSync("git checkout main -- README")', "a.ts"],
    ['"test": "vitest run -- token"', "package.json"],
    ["set -- a b", "code-fence"],
    ["# run: git diff --exit-code -- clients/go", "a.yml"],
    ["// pnpm test -- --watch", "a.ts"],
    ["pnpm test:run -- packages/sdk/src/a.test.ts", "a.md"],
    ["Run `pnpm lint -- src` or `a - b` first.", "a.md"],
    ["i-- and --flag", "a.ts"],
    // Markdown tables and comments
    ["| --- | :--: |", "a.md"],
    ["|:--|--:|", "a.md"],
    ["| `x` | -- |", "a.md"],
    ["| foo | -- | bar |", "a.md"],
    ["<!-- note -->", "a.md"],
    // Other syntax
    ["// @ts-expect-error -- Node fetch supports duplex", "a.ts"],
    ["// eslint-disable-next-line no-console -- debug only", "a.ts"],
    [" * @param owner - Balance owner address.", "a.ts"],
    ["const left = total - spent;", "a.ts"],
    ["// up to 2^64 - 1", "a.ts"],
    ["SELECT x -- trailing comment", "a.sql"],
    ["- a list item", "a.md"],
    ["Fields 100\u2013119 are reserved.", "a.md"],
  ])("allows %j", (text, file) => {
    expect(hasDash(text, file)).toBe(false);
  });
});

describe("codeFences", () => {
  it("lists the lines inside code fences", () => {
    const md = ["prose", "```bash", "git log -- src", "```", "prose", "~~~", "set -- a", "~~~"];
    expect([...codeFences(md.join("\n"))]).toEqual([3, 7]);
  });

  it("checks fenced Markdown lines as code", () => {
    const diff = [
      "diff --git a/d.md b/d.md",
      "--- a/d.md",
      "+++ b/d.md",
      "@@ -0,0 +1,4 @@",
      "+```bash",
      "+cargo run -- serve",
      "+```",
      "+Then cargo run -- serve again.",
    ].join("\n");
    const content = diff
      .split("\n")
      .slice(4)
      .map((line) => line.slice(1))
      .join("\n");

    expect(findAddedEmDashes(diff, () => content)).toEqual([
      { file: "d.md", line: 4, text: "Then cargo run -- serve again." },
    ]);
  });
});
