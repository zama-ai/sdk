import { describe, expect, it } from "vitest";
import { deriveWriteValidationDepth } from "../../report/reporter.js";

describe("report.deriveWriteValidationDepth", () => {
  it("returns FULL when submission and state verification both succeeded", () => {
    expect(
      deriveWriteValidationDepth({
        zamaWriteStatus: "PASS",
        observation: {
          submissionAttempted: true,
          submissionSucceeded: true,
          receiptObserved: true,
          stateVerified: true,
        },
      }),
    ).toBe("FULL");
  });

  it("returns PARTIAL when submission was attempted but not fully verified", () => {
    expect(
      deriveWriteValidationDepth({
        zamaWriteStatus: "INCONCLUSIVE",
        observation: {
          submissionAttempted: true,
          submissionSucceeded: false,
          receiptObserved: false,
          stateVerified: false,
        },
      }),
    ).toBe("PARTIAL");
  });

  it("returns UNTESTED when write flow did not execute", () => {
    expect(
      deriveWriteValidationDepth({
        zamaWriteStatus: "UNTESTED",
        observation: null,
      }),
    ).toBe("UNTESTED");
  });
});
