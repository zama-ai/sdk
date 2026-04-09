import { describe, expect, it } from "vitest";
import {
  importPathForTarget,
  normalizeTemplate,
  resolveInitAdapterConfig,
  resolveOutputPath,
  templateFor,
} from "../../cli/init-adapter.js";

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

describe("cli.init-adapter.resolveInitAdapterConfig", () => {
  it("parses output and template flags", () => {
    expect(
      resolveInitAdapterConfig(["node", "script", "--template", "mpc", "--output", "./out.ts"], {}),
    ).toEqual({
      outputPath: "./out.ts",
      template: "mpc",
      showHelp: false,
    });
  });

  it("supports positional output with template alias", () => {
    expect(resolveInitAdapterConfig(["node", "script", "./x.ts", "-t", "api"], {})).toEqual({
      outputPath: "./x.ts",
      template: "api-routed",
      showHelp: false,
    });
  });

  it("enables help mode", () => {
    expect(resolveInitAdapterConfig(["node", "script", "--help"], {})).toEqual({
      outputPath: "./my-adapter.ts",
      template: "generic",
      showHelp: true,
    });
  });

  it("throws on unsupported options", () => {
    expect(() => resolveInitAdapterConfig(["node", "script", "--invalid"], {})).toThrow(
      'Unsupported option "--invalid". Use --help for usage.',
    );
  });
});

describe("cli.init-adapter.normalizeTemplate", () => {
  it("supports known template variants", () => {
    expect(normalizeTemplate(undefined)).toBe("generic");
    expect(normalizeTemplate("EOA")).toBe("eoa");
    expect(normalizeTemplate("api")).toBe("api-routed");
    expect(normalizeTemplate("api-routed")).toBe("api-routed");
  });

  it("throws on unsupported template values", () => {
    expect(() => normalizeTemplate("foobar")).toThrow('Unsupported template "foobar".');
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

  it("renders EOA template with raw transaction signing", () => {
    const template = templateFor("./my-adapter.ts", "eoa");
    expect(template).toContain('declaredArchitecture: "EOA"');
    expect(template).toContain('rawTransactionSigning: "SUPPORTED"');
    expect(template).toContain("Implement signTransaction()");
  });

  it("renders MPC template with raw transaction signing unsupported", () => {
    const template = templateFor("./my-adapter.ts", "mpc");
    expect(template).toContain('declaredArchitecture: "MPC"');
    expect(template).toContain('rawTransactionSigning: "UNSUPPORTED"');
    expect(template).toContain("Implement writeContract() via your provider API");
  });

  it("renders API-routed template with provider-managed verification", () => {
    const template = templateFor("./my-adapter.ts", "api-routed");
    expect(template).toContain('declaredArchitecture: "API_ROUTED_EXECUTION"');
    expect(template).toContain('verificationModel: "PROVIDER_MANAGED"');
    expect(template).toContain('eip712Signing: "UNKNOWN"');
  });
});
