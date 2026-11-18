import { describe, expect, it } from "vitest";
import { EXPECTED, checkPreCommitHook } from "../pre-commit-hook.mjs";

describe("checkPreCommitHook", () => {
  it("accepts the expected steps", () => {
    expect(checkPreCommitHook(EXPECTED.join("\n"))).toEqual([]);
  });

  it("rejects an extra per-file check and points at lint-staged", () => {
    const problems = checkPreCommitHook(["node scripts/lint/x.mjs", ...EXPECTED].join("\n"));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("lint-staged.config.mjs");
  });

  it("rejects lint-staged running in parallel", () => {
    const problems = checkPreCommitHook(
      ["pnpm exec lint-staged", "pnpm typecheck", "pnpm llm:stage"].join("\n"),
    );

    expect(problems.some((p) => p.includes("--concurrent false"))).toBe(true);
  });
});
