import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { collectDiff, LLMS_FULL, CHANGELOG } from "../lib/collect-diff.mjs";

describe("collectDiff", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "collect-diff-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("classifies each input and writes diffs only for changes", () => {
    // Injected ref reader: llms-full changes, changelog absent on both sides.
    const contents = {
      "vA:llms-full.txt": "old line\n",
      "vB:llms-full.txt": "new line\n",
    };
    const read = (ref, path) => contents[`${ref}:${path}`] ?? null;

    const summary = collectDiff({
      fromRef: "vA",
      toRef: "vB",
      fromVersion: "A",
      toVersion: "B",
      outDir: dir,
      read,
    });

    const byPath = Object.fromEntries(summary.files.map((f) => [f.path, f]));
    expect(byPath[LLMS_FULL].status).toBe("changed");
    expect(existsSync(join(dir, "llms-full.diff"))).toBe(true);

    // Everything not in `contents` is absent on both refs -> no diff file.
    expect(byPath[CHANGELOG].status).toBe("absent");
    expect(byPath[CHANGELOG].diffFile).toBeNull();

    // bundle.json is always written and round-trips.
    const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
    expect(bundle.fromVersion).toBe("A");
    expect(bundle.toVersion).toBe("B");
  });

  test("marks an input added when absent on the from-ref only", () => {
    const read = (ref) => (ref === "vB" ? "brand new\n" : null);
    const summary = collectDiff({ fromRef: "vA", toRef: "vB", outDir: dir, read });
    expect(summary.files.find((f) => f.path === LLMS_FULL).status).toBe("added");
  });
});
