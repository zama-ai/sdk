import type { ValidationStatus } from "../adapter/types.js";
import type { CanonicalCheckId } from "../report/check-registry.js";

export type CanonicalCheckName =
  | "Zama Authorization Flow"
  | "Zama Write Flow"
  | "EIP-712 Recoverability";

export type CheckStatusOrMissing = ValidationStatus | "MISSING";
export type ClaimEvidenceReasonCategory =
  | "VALIDATED"
  | "COMPATIBILITY_FAILURE"
  | "UNSUPPORTED_SURFACE"
  | "NOT_EXECUTED"
  | "INFRA_OR_ENV_BLOCKER"
  | "MISSING_EVIDENCE";

export interface ClaimEvidenceDetail {
  check: CanonicalCheckName;
  checkId: CanonicalCheckId;
  status: CheckStatusOrMissing;
  reasonCategory: ClaimEvidenceReasonCategory;
}

export type ClaimId =
  | "INCOMPATIBLE_AUTHORIZATION_FAILED"
  | "INCOMPATIBLE_AUTHORIZATION_UNSUPPORTED"
  | "INCONCLUSIVE_AUTHORIZATION_BLOCKED"
  | "INCONCLUSIVE_AUTHORIZATION_UNTESTED"
  | "PARTIAL_AUTHORIZATION_CHECK_MISSING"
  | "INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY"
  | "PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED"
  | "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE"
  | "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED"
  | "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED"
  | "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED"
  | "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED"
  | "ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED";

export type VerdictConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ClaimResolution {
  id: ClaimId;
  verdictLabel: string;
  confidence?: VerdictConfidence;
  rationale: string[];
  evidence: Partial<Record<CanonicalCheckName, CheckStatusOrMissing>>;
  evidenceDetails?: ClaimEvidenceDetail[];
}

export interface ClaimRule {
  id: ClaimId;
  verdictLabel: string;
  requirements: Array<{
    check: CanonicalCheckName;
    oneOf: CheckStatusOrMissing[];
  }>;
  rationale: string[];
}
