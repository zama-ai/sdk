import { describe, expect, it } from "vitest";
import type { TestResult } from "../../report/reporter.js";
import { getCanonicalCheckByName } from "../../report/check-registry.js";
import { resolveClaimFromResults } from "../../verdict/resolve.js";

function check(name: string, status: TestResult["status"]): TestResult {
  const canonical = getCanonicalCheckByName(name);
  if (!canonical) {
    throw new Error(`Unknown canonical check "${name}"`);
  }
  return { checkId: canonical.id, name: canonical.name, section: canonical.section, status };
}

describe("verdict.resolveClaimFromResults", () => {
  it("returns incompatible when authorization fails", () => {
    const claim = resolveClaimFromResults([check("Zama Authorization Flow", "FAIL")]);
    expect(claim.id).toBe("INCOMPATIBLE_AUTHORIZATION_FAILED");
  });

  it("returns inconclusive when authorization is blocked", () => {
    const claim = resolveClaimFromResults([check("Zama Authorization Flow", "BLOCKED")]);
    expect(claim.id).toBe("INCONCLUSIVE_AUTHORIZATION_BLOCKED");
  });

  it("returns partial when authorization check is missing", () => {
    const claim = resolveClaimFromResults([check("Zama Write Flow", "PASS")]);
    expect(claim.id).toBe("PARTIAL_AUTHORIZATION_CHECK_MISSING");
  });

  it("returns incompatible when recoverability fails after auth pass", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "FAIL"),
    ]);
    expect(claim.id).toBe("INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY");
  });

  it("requires recoverability pass before full compatibility claims", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "UNTESTED"),
      check("Zama Write Flow", "PASS"),
    ]);
    expect(claim.id).toBe("PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED");
  });

  it("returns full compatibility when auth + recoverability + write pass", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "PASS"),
    ]);
    expect(claim.id).toBe("ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE");
  });

  it("returns partial write blocked when write is inconclusive", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "INCONCLUSIVE"),
    ]);
    expect(claim.id).toBe("PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED");
  });

  it("returns partial write failed when write submission fails", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "FAIL"),
    ]);
    expect(claim.id).toBe("PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED");
  });

  it("returns scoped authorization-compatible claim when write is missing", () => {
    const claim = resolveClaimFromResults([
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
    ]);
    expect(claim.id).toBe("ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED");
  });
});
