export type ValidationTarget = "AUTHORIZATION" | "AUTHORIZATION_AND_WRITE";

export type ValidationGateStatus = "PASS" | "PARTIAL" | "FAIL" | "INCONCLUSIVE";

export interface ValidationGateDecision {
  target: ValidationTarget;
  status: ValidationGateStatus;
  exitCode: number;
  summary: string;
}

export interface ValidationPolicy {
  allowPartial: boolean;
  expectedClaims: string[];
}

export interface EffectiveValidationGate {
  status: ValidationGateStatus | "FAIL";
  exitCode: number;
  summary: string;
  note?: string;
}

const INCOMPATIBLE_CLAIMS = new Set([
  "INCOMPATIBLE_AUTHORIZATION_FAILED",
  "INCOMPATIBLE_AUTHORIZATION_UNSUPPORTED",
  "INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY",
]);

const INCONCLUSIVE_CLAIMS = new Set([
  "INCONCLUSIVE_AUTHORIZATION_BLOCKED",
  "INCONCLUSIVE_AUTHORIZATION_UNTESTED",
  "PARTIAL_AUTHORIZATION_CHECK_MISSING",
]);

const AUTHORIZATION_COMPATIBLE_CLAIMS = new Set([
  "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
  "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED",
  "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED",
  "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED",
  "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED",
  "ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED",
]);

function normalizeTarget(raw: string | undefined): string {
  return (raw ?? "AUTHORIZATION").trim().toUpperCase();
}

export function parseValidationTarget(raw: string | undefined): ValidationTarget {
  const normalized = normalizeTarget(raw);
  if (normalized === "AUTHORIZATION") return "AUTHORIZATION";
  if (normalized === "AUTHORIZATION_AND_WRITE") return "AUTHORIZATION_AND_WRITE";
  throw new Error(
    `Invalid VALIDATION_TARGET="${raw}". Expected AUTHORIZATION or AUTHORIZATION_AND_WRITE.`,
  );
}

export function resolveValidationGate(
  claimId: string | undefined,
  target: ValidationTarget,
): ValidationGateDecision {
  const id = (claimId ?? "").trim();

  if (INCOMPATIBLE_CLAIMS.has(id)) {
    return {
      target,
      status: "FAIL",
      exitCode: 20,
      summary: "Authorization compatibility failed.",
    };
  }

  if (INCONCLUSIVE_CLAIMS.has(id)) {
    return {
      target,
      status: "INCONCLUSIVE",
      exitCode: 30,
      summary: "Authorization compatibility is inconclusive.",
    };
  }

  if (AUTHORIZATION_COMPATIBLE_CLAIMS.has(id)) {
    if (id === "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE") {
      return {
        target,
        status: "PASS",
        exitCode: 0,
        summary: "Authorization and write compatibility validated.",
      };
    }
    if (target === "AUTHORIZATION") {
      return {
        target,
        status: "PASS",
        exitCode: 0,
        summary: "Authorization compatibility validated for requested scope.",
      };
    }
    return {
      target,
      status: "PARTIAL",
      exitCode: 10,
      summary: "Authorization validated, but write compatibility is only partially validated.",
    };
  }

  return {
    target,
    status: "INCONCLUSIVE",
    exitCode: 31,
    summary: "Unknown claim. Compatibility gate is inconclusive.",
  };
}

export function applyValidationPolicy(
  decision: ValidationGateDecision,
  claimId: string,
  policy: ValidationPolicy,
): EffectiveValidationGate {
  if (policy.expectedClaims.length > 0 && !policy.expectedClaims.includes(claimId)) {
    return {
      status: "FAIL",
      exitCode: 21,
      summary: `Claim "${claimId}" is not allowed by policy.`,
      note: `Allowed claims: ${policy.expectedClaims.join(", ")}`,
    };
  }

  if (decision.status === "PARTIAL" && policy.allowPartial) {
    return {
      status: "PASS",
      exitCode: 0,
      summary: "Partial validation accepted by policy.",
      note: "allowPartial=true",
    };
  }

  return {
    status: decision.status,
    exitCode: decision.exitCode,
    summary: decision.summary,
  };
}
