import { describe, expect, test } from "vitest";
import { buildGuideIndex } from "../lib/dist.mjs";

describe("buildGuideIndex", () => {
  test("summarises each guide and sorts by from then to", () => {
    const guides = [
      { from: "3.0.0-alpha.32", to: "3.2.0", changes: [{ severity: "required" }] },
      {
        from: "3.0.0-alpha.10",
        to: "3.1.0-alpha.5",
        changes: [{ severity: "required" }, { severity: "recommended" }],
      },
    ];
    const index = buildGuideIndex(guides);
    expect(index.schemaVersion).toBe(1);
    expect(index.guides).toEqual([
      {
        from: "3.0.0-alpha.10",
        to: "3.1.0-alpha.5",
        file: "3.0.0-alpha.10__3.1.0-alpha.5.json",
        changes: 2,
        required: 1,
      },
      {
        from: "3.0.0-alpha.32",
        to: "3.2.0",
        file: "3.0.0-alpha.32__3.2.0.json",
        changes: 1,
        required: 1,
      },
    ]);
  });

  test("handles a guide with no changes array", () => {
    const index = buildGuideIndex([{ from: "1.0.0", to: "2.0.0" }]);
    expect(index.guides[0]).toMatchObject({ changes: 0, required: 0 });
  });

  test("empty input yields an empty catalogue", () => {
    expect(buildGuideIndex([])).toEqual({ schemaVersion: 1, guides: [] });
  });
});
