import { describe, expect, it } from "vitest";
import { findAddedEmDashes } from "../no-em-dash.mjs";

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

  it("drops the tab git appends to a path with a space", () => {
    const diff = [
      "diff --git a/docs/my file.md b/docs/my file.md",
      "--- a/docs/my file.md\t",
      "+++ b/docs/my file.md\t",
      "@@ -1,0 +2,1 @@",
      `+bad ${EM_DASH} here`,
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([
      { file: "docs/my file.md", line: 2, text: `bad ${EM_DASH} here` },
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
