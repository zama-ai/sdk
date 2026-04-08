import { describe, expect, it } from "vitest";
import { getCanonicalCheckByName } from "../../report/check-registry.js";
import type { TestResult } from "../../report/reporter.js";
import { assertClaimConsistency } from "../../verdict/consistency.js";
import { resolveClaimFromResults } from "../../verdict/resolve.js";
import type { ClaimResolution } from "../../verdict/types.js";

function check(name: string, status: TestResult["status"]): TestResult {
  const canonical = getCanonicalCheckByName(name);
  if (!canonical) {
    throw new Error(`Unknown canonical check "${name}"`);
  }
  return {
    checkId: canonical.id,
    name: canonical.name,
    section: canonical.section,
    status,
  };
}

describe("verdict.assertClaimConsistency", () => {
  it("accepts a claim resolved from matching observed statuses", () => {
    const results = [
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "FAIL"),
    ];
    const claim = resolveClaimFromResults(results);
    expect(() => assertClaimConsistency(claim, results)).not.toThrow();
  });

  it("rejects evidence that disagrees with observed statuses", () => {
    const results = [
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "FAIL"),
    ];
    const claim = resolveClaimFromResults(results);
    const inconsistent: ClaimResolution = {
      ...claim,
      evidence: {
        ...claim.evidence,
        "Zama Write Flow": "PASS",
      },
    };
    expect(() => assertClaimConsistency(inconsistent, results)).toThrow(
      'Claim evidence mismatch for "Zama Write Flow"',
    );
  });

  it("rejects claims whose rule requirements are not satisfied", () => {
    const results = [
      check("Zama Authorization Flow", "PASS"),
      check("EIP-712 Recoverability", "PASS"),
      check("Zama Write Flow", "FAIL"),
    ];
    const inconsistent: ClaimResolution = {
      id: "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
      verdictLabel: "ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS",
      rationale: ["manually forced inconsistent claim"],
      evidence: {
        "Zama Authorization Flow": "PASS",
        "EIP-712 Recoverability": "PASS",
        "Zama Write Flow": "PASS",
      },
    };
    expect(() => assertClaimConsistency(inconsistent, results)).toThrow(
      'requirement "Zama Write Flow" not satisfied',
    );
  });
});
