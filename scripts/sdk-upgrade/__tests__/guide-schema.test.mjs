import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { validateGuide, selectGuide } from "../lib/guide-schema.mjs";
import { repoRoot } from "../lib/app.mjs";

function validChange(overrides = {}) {
  return {
    id: "rename-foo",
    kind: "rename",
    appliesTo: "@zama-fhe/sdk",
    from: "foo",
    to: "bar",
    detection: "call sites of foo",
    action: "rename foo to bar",
    severity: "required",
    ...overrides,
  };
}

function validGuide(overrides = {}) {
  return { schemaVersion: 1, from: "3.0.0", to: "3.1.0", changes: [validChange()], ...overrides };
}

describe("validateGuide", () => {
  test("accepts a well-formed guide", () => {
    expect(validateGuide(validGuide())).toEqual({ ok: true, errors: [] });
  });

  test("rejects a wrong schemaVersion", () => {
    const r = validateGuide(validGuide({ schemaVersion: 2 }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/schemaVersion/);
  });

  test("rejects missing change fields", () => {
    const r = validateGuide(validGuide({ changes: [validChange({ action: undefined })] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/changes\[0\]\.action is missing/);
  });

  test("rejects an unknown kind and severity", () => {
    const r = validateGuide(validGuide({ changes: [validChange({ kind: "magic", severity: "maybe" })] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/kind "magic"/);
    expect(r.errors.join()).toMatch(/severity "maybe"/);
  });

  test("rejects duplicate ids", () => {
    const r = validateGuide(validGuide({ changes: [validChange(), validChange()] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/duplicated/);
  });

  test("rejects a non-object", () => {
    expect(validateGuide(null).ok).toBe(false);
  });

  test("the committed react-viem guide is schema-valid", () => {
    const path = join(repoRoot(), "migrations", "3.0.0-alpha.32__3.1.0-alpha.5.json");
    const guide = JSON.parse(readFileSync(path, "utf8"));
    expect(validateGuide(guide)).toEqual({ ok: true, errors: [] });
  });
});

describe("selectGuide", () => {
  const guides = [
    { from: "3.0.0-alpha.32", to: "3.1.0-alpha.5" },
    { from: "3.0.0-alpha.10", to: "3.1.0-alpha.5" },
    { from: "3.0.0-alpha.32", to: "3.2.0" },
  ];

  test("picks the guide matching the target with the nearest floor <= installed", () => {
    // react-ethers is at alpha.34; the alpha.32 floor covers it.
    expect(selectGuide("3.0.0-alpha.34", "3.1.0-alpha.5", guides)).toEqual(guides[0]);
  });

  test("picks the lower floor when the app predates the nearest one", () => {
    expect(selectGuide("3.0.0-alpha.20", "3.1.0-alpha.5", guides)).toEqual(guides[1]);
  });

  test("returns null when no floor is <= installed", () => {
    expect(selectGuide("3.0.0-alpha.5", "3.1.0-alpha.5", guides)).toBeNull();
  });

  test("returns null when no guide targets the requested version", () => {
    expect(selectGuide("3.0.0-alpha.34", "9.9.9", guides)).toBeNull();
  });
});
