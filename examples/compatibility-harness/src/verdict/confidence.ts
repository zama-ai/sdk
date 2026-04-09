import type { CheckStatusOrMissing, ClaimResolution, VerdictConfidence } from "./types.js";
import type { WriteValidationDepth } from "../report/schema.js";

function status(
  evidence: ClaimResolution["evidence"],
  key: "Zama Authorization Flow" | "EIP-712 Recoverability",
): CheckStatusOrMissing {
  return evidence[key] ?? "MISSING";
}

export function resolveClaimConfidence(input: {
  evidence: ClaimResolution["evidence"];
  writeValidationDepth: WriteValidationDepth;
  blockerCount: number;
}): VerdictConfidence {
  const authStatus = status(input.evidence, "Zama Authorization Flow");
  const recoverabilityStatus = status(input.evidence, "EIP-712 Recoverability");

  if (authStatus === "FAIL" || authStatus === "UNSUPPORTED") {
    return "HIGH";
  }

  if (authStatus === "PASS" && recoverabilityStatus === "FAIL") {
    return "HIGH";
  }

  if (authStatus === "PASS" && recoverabilityStatus === "PASS") {
    if (input.writeValidationDepth === "FULL" && input.blockerCount === 0) {
      return "HIGH";
    }
    return "MEDIUM";
  }

  return "LOW";
}
