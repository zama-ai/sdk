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

  it("ignores removed lines and generated files", () => {
    const diff = [
      "--- a/docs/x.md",
      "+++ b/docs/x.md",
      "@@ -1 +1 @@",
      `-old ${EM_DASH} line`,
      "+new line",
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -0,0 +1 @@",
      `+* feat ${EM_DASH} generated`,
    ].join("\n");

    expect(findAddedEmDashes(diff)).toEqual([]);
  });
});
