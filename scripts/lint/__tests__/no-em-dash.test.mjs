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
