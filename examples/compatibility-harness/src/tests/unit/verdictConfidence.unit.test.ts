import { describe, expect, it } from "vitest";
import { resolveClaimConfidence } from "../../verdict/confidence.js";

describe("verdict.resolveClaimConfidence", () => {
  it("returns HIGH for fully validated auth+recoverability+write without blockers", () => {
    expect(
      resolveClaimConfidence({
        evidence: {
          "Zama Authorization Flow": "PASS",
          "EIP-712 Recoverability": "PASS",
          "Zama Write Flow": "PASS",
        },
        writeValidationDepth: "FULL",
        blockerCount: 0,
      }),
    ).toBe("HIGH");
  });

  it("returns MEDIUM for auth-compatible claims when write is not full", () => {
    expect(
      resolveClaimConfidence({
        evidence: {
          "Zama Authorization Flow": "PASS",
          "EIP-712 Recoverability": "PASS",
          "Zama Write Flow": "BLOCKED",
        },
        writeValidationDepth: "PARTIAL",
        blockerCount: 1,
      }),
    ).toBe("MEDIUM");
  });

  it("returns HIGH for clear incompatibility failures", () => {
    expect(
      resolveClaimConfidence({
        evidence: {
          "Zama Authorization Flow": "FAIL",
        },
        writeValidationDepth: "UNTESTED",
        blockerCount: 0,
      }),
    ).toBe("HIGH");
  });

  it("returns LOW when authorization evidence is inconclusive", () => {
    expect(
      resolveClaimConfidence({
        evidence: {
          "Zama Authorization Flow": "INCONCLUSIVE",
        },
        writeValidationDepth: "UNTESTED",
        blockerCount: 2,
      }),
    ).toBe("LOW");
  });
});
