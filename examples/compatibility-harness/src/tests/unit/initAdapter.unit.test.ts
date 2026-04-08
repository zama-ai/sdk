import { describe, expect, it } from "vitest";
import { importPathForTarget, resolveOutputPath, templateFor } from "../../cli/init-adapter.js";

describe("cli.init-adapter.resolveOutputPath", () => {
  it("prefers argv path", () => {
    expect(resolveOutputPath(["node", "script", "./custom.ts"], {})).toBe("./custom.ts");
  });

  it("falls back to env path", () => {
    expect(resolveOutputPath(["node", "script"], { ADAPTER_TEMPLATE_PATH: "./from-env.ts" })).toBe(
      "./from-env.ts",
    );
  });

  it("falls back to default", () => {
    expect(resolveOutputPath(["node", "script"], {})).toBe("./my-adapter.ts");
  });
});

describe("cli.init-adapter.importPathForTarget", () => {
  it("resolves import path from root target", () => {
    expect(importPathForTarget("./my-adapter.ts")).toBe("./src/adapter/types.js");
  });

  it("resolves import path from nested target", () => {
    expect(importPathForTarget("./examples/foo/my-adapter.ts")).toBe("../../src/adapter/types.js");
  });
});

describe("cli.init-adapter.templateFor", () => {
  it("includes adapter export and inferred import path", () => {
    const template = templateFor("./examples/foo/my-adapter.ts");
    expect(template).toContain('import type { Adapter } from "../../src/adapter/types.js";');
    expect(template).toContain("export const adapter: Adapter = {");
    expect(template).toContain("Implement getAddress()");
  });
});
