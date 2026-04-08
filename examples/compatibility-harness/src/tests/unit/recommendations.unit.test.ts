import { describe, expect, it } from "vitest";
import { recommendationForDiagnostic } from "../../harness/recommendations.js";

describe("harness.recommendations.recommendationForDiagnostic", () => {
  it("returns deterministic recommendation text for known error codes", () => {
    expect(
      recommendationForDiagnostic({
        status: "BLOCKED",
        errorCode: "ENV_MISSING_CONFIG",
        rootCauseCategory: "ENVIRONMENT",
      }),
    ).toBe(
      "Set the required environment variables and credentials for your adapter. Next: `npm run doctor`.",
    );
    expect(
      recommendationForDiagnostic({
        status: "INCONCLUSIVE",
        errorCode: "RPC_CONNECTIVITY",
        rootCauseCategory: "RPC",
      }),
    ).toBe(
      "Check RPC_URL/network reachability and retry once connectivity is stable. Next: `npm run doctor`.",
    );
  });

  it("falls back to root-cause recommendations when errorCode is absent", () => {
    expect(
      recommendationForDiagnostic({
        status: "INCONCLUSIVE",
        rootCauseCategory: "RELAYER",
      }),
    ).toBe("Validate relayer endpoint health and authentication settings. Next: `npm run doctor`.");
  });

  it("returns undefined for non-blocking statuses", () => {
    expect(
      recommendationForDiagnostic({
        status: "FAIL",
        errorCode: "RPC_CONNECTIVITY",
        rootCauseCategory: "RPC",
      }),
    ).toBeUndefined();
  });
});
