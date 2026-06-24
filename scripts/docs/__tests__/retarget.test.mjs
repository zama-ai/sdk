import { describe, expect, test } from "vitest";
import { retargetUrls } from "../retarget.mjs";
import { findUrlProblems } from "../check-target.mjs";

describe("retargetUrls — raw.githubusercontent branch segment", () => {
  test("main → prerelease flips the branch", () => {
    expect(retargetUrls("raw.githubusercontent.com/zama-ai/sdk/main/llms.txt", "prerelease")).toBe(
      "raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt",
    );
  });

  test("prerelease → main flips back", () => {
    expect(
      retargetUrls("raw.githubusercontent.com/zama-ai/sdk/prerelease/llms-full.txt", "main"),
    ).toBe("raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt");
  });
});

describe("retargetUrls — docs.zama.org space segment (stable is implicit)", () => {
  const stableUrl = "docs.zama.org/protocol/sdk/guides/handle-errors.md";
  const alphaUrl = "docs.zama.org/protocol/sdk/alpha/guides/handle-errors.md";

  test("main → prerelease INSERTS the alpha segment", () => {
    expect(retargetUrls(stableUrl, "prerelease")).toBe(alphaUrl);
  });

  test("prerelease → main REMOVES the alpha segment", () => {
    expect(retargetUrls(alphaUrl, "main")).toBe(stableUrl);
  });

  test("retargeting to the current branch is a no-op (idempotent)", () => {
    expect(retargetUrls(alphaUrl, "prerelease")).toBe(alphaUrl);
    expect(retargetUrls(stableUrl, "main")).toBe(stableUrl);
  });

  test("rewrites every occurrence on a line", () => {
    const both = `see ${stableUrl} and ${stableUrl}`;
    expect(retargetUrls(both, "prerelease")).toBe(`see ${alphaUrl} and ${alphaUrl}`);
  });

  test("does not treat a real path segment as a space segment", () => {
    // `overview` is a page, not a space — alpha must be inserted before it.
    expect(retargetUrls("docs.zama.org/protocol/sdk/overview.md", "prerelease")).toBe(
      "docs.zama.org/protocol/sdk/alpha/overview.md",
    );
  });
});

describe("findUrlProblems — catches the implicit-stable blind spot", () => {
  test("space-less (stable) URL on prerelease is flagged", () => {
    const problems = findUrlProblems("docs.zama.org/protocol/sdk/guides/x.md", "prerelease");
    expect(problems).toEqual([`links to the "stable" GitBook space (expected "alpha")`]);
  });

  test("alpha URL on main is flagged", () => {
    const problems = findUrlProblems("docs.zama.org/protocol/sdk/alpha/guides/x.md", "main");
    expect(problems).toEqual([`links to the "alpha" GitBook space (expected "stable")`]);
  });

  test("correctly-targeted URLs are clean in both directions", () => {
    expect(findUrlProblems("docs.zama.org/protocol/sdk/alpha/x.md", "prerelease")).toEqual([]);
    expect(findUrlProblems("docs.zama.org/protocol/sdk/x.md", "main")).toEqual([]);
  });

  test("wrong raw.githubusercontent branch is flagged", () => {
    const problems = findUrlProblems(
      "raw.githubusercontent.com/zama-ai/sdk/main/llms.txt",
      "prerelease",
    );
    expect(problems).toEqual([`links to the "main" branch (expected "prerelease")`]);
  });
});
