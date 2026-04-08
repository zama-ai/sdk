import type { ValidationStatus } from "../adapter/types.js";
import { CLAIM_RULES } from "./claims.js";
import type { CanonicalCheckName, CheckStatusOrMissing, ClaimResolution } from "./types.js";

export interface ClaimCheckStatus {
  name: string;
  status: ValidationStatus;
}

const CLAIM_CHECK_NAMES: readonly CanonicalCheckName[] = [
  "Zama Authorization Flow",
  "EIP-712 Recoverability",
  "Zama Write Flow",
];

function isCanonicalClaimCheckName(value: string): value is CanonicalCheckName {
  return CLAIM_CHECK_NAMES.includes(value as CanonicalCheckName);
}

function checkStatus(
  checks: Map<CanonicalCheckName, ValidationStatus>,
  check: CanonicalCheckName,
): CheckStatusOrMissing {
  return checks.get(check) ?? "MISSING";
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

  const allowedEvidenceKeys = new Set(rule.requirements.map((requirement) => requirement.check));
  for (const key of Object.keys(claim.evidence)) {
    if (!isCanonicalClaimCheckName(key)) {
      throw new Error(`Unexpected claim evidence key "${key}".`);
    }
    if (!allowedEvidenceKeys.has(key)) {
      throw new Error(`Claim evidence key "${key}" is not required by claim ${claim.id}.`);
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
}
