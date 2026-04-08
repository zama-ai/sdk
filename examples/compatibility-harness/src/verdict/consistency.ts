import type { ValidationStatus } from "../adapter/types.js";
import type { CanonicalCheckId } from "../report/check-registry.js";
import { CLAIM_RULES } from "./claims.js";
import type {
  CanonicalCheckName,
  CheckStatusOrMissing,
  ClaimEvidenceReasonCategory,
  ClaimResolution,
} from "./types.js";

export interface ClaimCheckStatus {
  name: string;
  status: ValidationStatus;
}

const CLAIM_CHECK_NAMES: readonly CanonicalCheckName[] = [
  "Zama Authorization Flow",
  "EIP-712 Recoverability",
  "Zama Write Flow",
];

const CLAIM_CHECK_IDS: Record<CanonicalCheckName, CanonicalCheckId> = {
  "Zama Authorization Flow": "ZAMA_AUTHORIZATION_FLOW",
  "EIP-712 Recoverability": "EIP712_RECOVERABILITY",
  "Zama Write Flow": "ZAMA_WRITE_FLOW",
};

function isCanonicalClaimCheckName(value: string): value is CanonicalCheckName {
  return CLAIM_CHECK_NAMES.includes(value as CanonicalCheckName);
}

function isCheckStatusOrMissing(value: string): value is CheckStatusOrMissing {
  return (
    value === "PASS" ||
    value === "FAIL" ||
    value === "UNTESTED" ||
    value === "UNSUPPORTED" ||
    value === "BLOCKED" ||
    value === "INCONCLUSIVE" ||
    value === "MISSING"
  );
}

function checkStatus(
  checks: Map<CanonicalCheckName, ValidationStatus>,
  check: CanonicalCheckName,
): CheckStatusOrMissing {
  return checks.get(check) ?? "MISSING";
}

export function claimCheckId(name: CanonicalCheckName): CanonicalCheckId {
  return CLAIM_CHECK_IDS[name];
}

export function evidenceReasonCategory(status: CheckStatusOrMissing): ClaimEvidenceReasonCategory {
  switch (status) {
    case "PASS":
      return "VALIDATED";
    case "FAIL":
      return "COMPATIBILITY_FAILURE";
    case "UNSUPPORTED":
      return "UNSUPPORTED_SURFACE";
    case "UNTESTED":
      return "NOT_EXECUTED";
    case "BLOCKED":
    case "INCONCLUSIVE":
      return "INFRA_OR_ENV_BLOCKER";
    case "MISSING":
      return "MISSING_EVIDENCE";
  }
}

export function assertClaimConsistency(
  claim: ClaimResolution,
  observedChecks: ClaimCheckStatus[],
): void {
  const rule = CLAIM_RULES.find((candidate) => candidate.id === claim.id);
  if (!rule) {
    throw new Error(`Unknown claim id "${claim.id}" in report artifact.`);
  }

  if (claim.verdictLabel !== rule.verdictLabel) {
    throw new Error(
      `Claim verdict label mismatch for ${claim.id}: expected "${rule.verdictLabel}", got "${claim.verdictLabel}".`,
    );
  }

  const statuses = new Map<CanonicalCheckName, ValidationStatus>();
  for (const check of observedChecks) {
    if (!isCanonicalClaimCheckName(check.name)) continue;
    const existing = statuses.get(check.name);
    if (existing && existing !== check.status) {
      throw new Error(
        `Claim check "${check.name}" has conflicting statuses (${existing}, ${check.status}).`,
      );
    }
    statuses.set(check.name, check.status);
  }

  for (const [key, value] of Object.entries(claim.evidence)) {
    if (!isCanonicalClaimCheckName(key)) {
      throw new Error(`Unexpected claim evidence key "${key}".`);
    }
    if (!isCheckStatusOrMissing(String(value))) {
      throw new Error(
        `Claim evidence for "${key}" has invalid status "${String(value)}" in claim ${claim.id}.`,
      );
    }
  }

  for (const requirement of rule.requirements) {
    const status = checkStatus(statuses, requirement.check);
    if (!requirement.oneOf.includes(status)) {
      throw new Error(
        `Claim ${claim.id} requirement "${requirement.check}" not satisfied by observed status "${status}".`,
      );
    }

    const evidence = claim.evidence[requirement.check];
    if (!evidence) {
      throw new Error(`Missing claim evidence for "${requirement.check}" in claim ${claim.id}.`);
    }
    if (evidence !== status) {
      throw new Error(
        `Claim evidence mismatch for "${requirement.check}": expected "${status}", got "${evidence}".`,
      );
    }
  }

  if (!claim.evidenceDetails) return;

  const detailsByCheck = new Map<CanonicalCheckName, (typeof claim.evidenceDetails)[number]>();
  for (const detail of claim.evidenceDetails) {
    if (!isCanonicalClaimCheckName(detail.check)) {
      throw new Error(`Unexpected evidenceDetails.check "${detail.check}" in claim ${claim.id}.`);
    }
    if (detail.checkId !== claimCheckId(detail.check)) {
      throw new Error(
        `evidenceDetails.checkId mismatch for "${detail.check}": expected "${claimCheckId(detail.check)}", got "${detail.checkId}".`,
      );
    }
    const expectedCategory = evidenceReasonCategory(detail.status);
    if (detail.reasonCategory !== expectedCategory) {
      throw new Error(
        `evidenceDetails.reasonCategory mismatch for "${detail.check}": expected "${expectedCategory}", got "${detail.reasonCategory}".`,
      );
    }
    const evidenceStatus = claim.evidence[detail.check];
    if (evidenceStatus && evidenceStatus !== detail.status) {
      throw new Error(
        `evidenceDetails.status mismatch for "${detail.check}": evidence has "${evidenceStatus}", details has "${detail.status}".`,
      );
    }
    if (detailsByCheck.has(detail.check)) {
      throw new Error(
        `Duplicate evidenceDetails entry for "${detail.check}" in claim ${claim.id}.`,
      );
    }
    detailsByCheck.set(detail.check, detail);
  }

  for (const requirement of rule.requirements) {
    if (!detailsByCheck.has(requirement.check)) {
      throw new Error(
        `Missing evidenceDetails entry for "${requirement.check}" in claim ${claim.id}.`,
      );
    }
  }
}
