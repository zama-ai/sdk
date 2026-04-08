import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveValidationConfig } from "../../cli/validate-config.js";

function makePolicyFile(content: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "zama-validate-policy-"));
  const path = join(dir, "policy.json");
  writeFileSync(path, JSON.stringify(content, null, 2));
  return { dir, path };
}

describe("cli.validate-config.resolveValidationConfig", () => {
  it("uses defaults without policy file", () => {
    const config = resolveValidationConfig({});
    expect(config).toEqual({
      target: "AUTHORIZATION",
      policy: {
        allowPartial: false,
        expectedClaims: [],
      },
    });
  });

  it("loads target and claim constraints from policy file", () => {
    const { dir, path } = makePolicyFile({
      target: "AUTHORIZATION_AND_WRITE",
      expectedClaims: ["ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE"],
    });
    try {
      const config = resolveValidationConfig({
        VALIDATION_POLICY_PATH: path,
      });
      expect(config).toEqual({
        target: "AUTHORIZATION_AND_WRITE",
        policy: {
          allowPartial: false,
          expectedClaims: ["ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE"],
        },
        policyPath: path,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows env to override policy target and allowPartial", () => {
    const { dir, path } = makePolicyFile({
      target: "AUTHORIZATION_AND_WRITE",
      allowPartial: false,
    });
    try {
      const config = resolveValidationConfig({
        VALIDATION_POLICY_PATH: path,
        VALIDATION_TARGET: "AUTHORIZATION",
        VALIDATION_ALLOW_PARTIAL: "true",
      });
      expect(config).toEqual({
        target: "AUTHORIZATION",
        policy: {
          allowPartial: true,
          expectedClaims: [],
        },
        policyPath: path,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when policy expectedClaims is malformed", () => {
    const { dir, path } = makePolicyFile({
      expectedClaims: ["OK", 1],
    });
    try {
      expect(() => resolveValidationConfig({ VALIDATION_POLICY_PATH: path })).toThrow(
        "Validation policy expectedClaims must contain only non-empty strings.",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
