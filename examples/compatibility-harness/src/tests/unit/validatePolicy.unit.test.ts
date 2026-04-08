import { describe, expect, it } from "vitest";
import {
  applyValidationPolicy,
  parseValidationTarget,
  resolveValidationGate,
} from "../../cli/validate-policy.js";

describe("cli.validate-policy.parseValidationTarget", () => {
  it("defaults to AUTHORIZATION", () => {
    expect(parseValidationTarget(undefined)).toBe("AUTHORIZATION");
  });

  it("parses AUTHORIZATION_AND_WRITE", () => {
    expect(parseValidationTarget("authorization_and_write")).toBe("AUTHORIZATION_AND_WRITE");
  });

  it("throws on invalid target", () => {
    expect(() => parseValidationTarget("all")).toThrow(
      'Invalid VALIDATION_TARGET="all". Expected AUTHORIZATION or AUTHORIZATION_AND_WRITE.',
    );
  });
});

describe("cli.validate-policy.resolveValidationGate", () => {
  it("returns PASS for full compatibility on strict target", () => {
    expect(
      resolveValidationGate("ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE", "AUTHORIZATION_AND_WRITE"),
    ).toEqual({
      target: "AUTHORIZATION_AND_WRITE",
      status: "PASS",
      exitCode: 0,
      summary: "Authorization and write compatibility validated.",
    });
  });

  it("returns PASS for auth-compatible partial claims on auth-only target", () => {
    expect(
      resolveValidationGate("PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED", "AUTHORIZATION"),
    ).toEqual({
      target: "AUTHORIZATION",
      status: "PASS",
      exitCode: 0,
      summary: "Authorization compatibility validated for requested scope.",
    });
  });

  it("returns PARTIAL on strict target when write is not fully validated", () => {
    expect(
      resolveValidationGate(
        "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED",
        "AUTHORIZATION_AND_WRITE",
      ),
    ).toEqual({
      target: "AUTHORIZATION_AND_WRITE",
      status: "PARTIAL",
      exitCode: 10,
      summary: "Authorization validated, but write compatibility is only partially validated.",
    });
  });

  it("returns FAIL for incompatible claims", () => {
    expect(resolveValidationGate("INCOMPATIBLE_AUTHORIZATION_FAILED", "AUTHORIZATION")).toEqual({
      target: "AUTHORIZATION",
      status: "FAIL",
      exitCode: 20,
      summary: "Authorization compatibility failed.",
    });
  });

  it("returns INCONCLUSIVE for blocked claims", () => {
    expect(resolveValidationGate("INCONCLUSIVE_AUTHORIZATION_BLOCKED", "AUTHORIZATION")).toEqual({
      target: "AUTHORIZATION",
      status: "INCONCLUSIVE",
      exitCode: 30,
      summary: "Authorization compatibility is inconclusive.",
    });
  });

  it("treats recoverability-unconfirmed claims as INCONCLUSIVE", () => {
    expect(
      resolveValidationGate("PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED", "AUTHORIZATION"),
    ).toEqual({
      target: "AUTHORIZATION",
      status: "INCONCLUSIVE",
      exitCode: 30,
      summary: "Authorization compatibility is inconclusive.",
    });
  });

  it("returns unknown-claim INCONCLUSIVE fallback", () => {
    expect(resolveValidationGate("SOMETHING_NEW", "AUTHORIZATION")).toEqual({
      target: "AUTHORIZATION",
      status: "INCONCLUSIVE",
      exitCode: 31,
      summary: "Unknown claim. Compatibility gate is inconclusive.",
    });
  });
});

describe("cli.validate-policy.applyValidationPolicy", () => {
  it("keeps base decision when no extra constraints are configured", () => {
    const base = resolveValidationGate(
      "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
      "AUTHORIZATION_AND_WRITE",
    );
    expect(
      applyValidationPolicy(base, "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE", {
        allowPartial: false,
        expectedClaims: [],
      }),
    ).toEqual({
      status: "PASS",
      exitCode: 0,
      summary: "Authorization and write compatibility validated.",
    });
  });

  it("fails when claim is not allowed by expectedClaims policy", () => {
    const base = resolveValidationGate("INCONCLUSIVE_AUTHORIZATION_BLOCKED", "AUTHORIZATION");
    expect(
      applyValidationPolicy(base, "INCONCLUSIVE_AUTHORIZATION_BLOCKED", {
        allowPartial: false,
        expectedClaims: ["ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE"],
      }),
    ).toEqual({
      status: "FAIL",
      exitCode: 21,
      summary: 'Claim "INCONCLUSIVE_AUTHORIZATION_BLOCKED" is not allowed by policy.',
      note: "Allowed claims: ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
    });
  });

  it("promotes partial to pass when allowPartial is enabled", () => {
    const base = resolveValidationGate(
      "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED",
      "AUTHORIZATION_AND_WRITE",
    );
    expect(
      applyValidationPolicy(base, "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED", {
        allowPartial: true,
        expectedClaims: [],
      }),
    ).toEqual({
      status: "PASS",
      exitCode: 0,
      summary: "Partial validation accepted by policy.",
      note: "allowPartial=true",
    });
  });
});
