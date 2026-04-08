import { describe, expect, it } from "vitest";
import { detectCapabilityContradictions } from "../../adapter/contradictions.js";
import { emptyCapabilities } from "../../adapter/types.js";

describe("adapter.detectCapabilityContradictions", () => {
  it("returns no contradiction when declared and observed states match", () => {
    const declared = {
      ...emptyCapabilities(),
      eip712Signing: "SUPPORTED" as const,
      rawTransactionSigning: "UNSUPPORTED" as const,
    };
    const observed = {
      ...declared,
    };
    expect(detectCapabilityContradictions(declared, observed)).toEqual([]);
  });

  it("reports contradictions when declared and observed states diverge", () => {
    const declared = {
      ...emptyCapabilities(),
      eip712Signing: "SUPPORTED" as const,
      rawTransactionSigning: "UNSUPPORTED" as const,
    };
    const observed = {
      ...emptyCapabilities(),
      eip712Signing: "UNSUPPORTED" as const,
      rawTransactionSigning: "SUPPORTED" as const,
    };
    const contradictions = detectCapabilityContradictions(declared, observed);
    expect(contradictions.length).toBe(2);
    expect(contradictions[0]).toContain("Eip712 Signing");
    expect(contradictions[1]).toContain("Raw Transaction Signing");
  });
});
