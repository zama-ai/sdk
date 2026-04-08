import type { ValidationStatus } from "../adapter/types.js";
import type { TestResult } from "../report/reporter.js";
import { CLAIM_RULES } from "./claims.js";
import { claimCheckId, evidenceReasonCategory } from "./consistency.js";
import type {
  CanonicalCheckName,
  CheckStatusOrMissing,
  ClaimResolution,
  ClaimRule,
} from "./types.js";

function checkStatus(
  checks: Partial<Record<CanonicalCheckName, ValidationStatus>>,
  check: CanonicalCheckName,
): CheckStatusOrMissing {
  return checks[check] ?? "MISSING";
}

function buildCanonicalCheckMap(
  results: TestResult[],
): Partial<Record<CanonicalCheckName, ValidationStatus>> {
  const byName = new Map(results.map((result) => [result.name, result]));
  return {
    "Zama Authorization Flow": byName.get("Zama Authorization Flow")?.status,
    "Zama Write Flow": byName.get("Zama Write Flow")?.status,
    "EIP-712 Recoverability": byName.get("EIP-712 Recoverability")?.status,
  };
}

function ruleMatches(
  checks: Partial<Record<CanonicalCheckName, ValidationStatus>>,
  rule: ClaimRule,
): boolean {
  return rule.requirements.every((requirement) => {
    const status = checkStatus(checks, requirement.check);
    return requirement.oneOf.includes(status);
  });
}

export function resolveClaimFromResults(results: TestResult[]): ClaimResolution {
  const canonicalChecks = buildCanonicalCheckMap(results);
  for (const rule of CLAIM_RULES) {
    if (!ruleMatches(canonicalChecks, rule)) continue;
    const evidence = Object.fromEntries(
      rule.requirements.map((requirement) => {
        return [requirement.check, checkStatus(canonicalChecks, requirement.check)];
      }),
    ) as ClaimResolution["evidence"];
    const evidenceDetails = rule.requirements.map((requirement) => {
      const status = checkStatus(canonicalChecks, requirement.check);
      return {
        check: requirement.check,
        checkId: claimCheckId(requirement.check),
        status,
        reasonCategory: evidenceReasonCategory(status),
      };
    });

    return {
      id: rule.id,
      verdictLabel: rule.verdictLabel,
      rationale: rule.rationale,
      evidence,
      evidenceDetails,
    };
  }

  const fallbackStatus = checkStatus(canonicalChecks, "Zama Authorization Flow");
  const fallbackEvidence: ClaimResolution["evidence"] = {
    "Zama Authorization Flow": fallbackStatus,
  };
  const fallbackEvidenceDetails = [
    {
      check: "Zama Authorization Flow" as const,
      checkId: claimCheckId("Zama Authorization Flow"),
      status: fallbackStatus,
      reasonCategory: evidenceReasonCategory(fallbackStatus),
    },
  ];

  return {
    id: "PARTIAL_AUTHORIZATION_CHECK_MISSING",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION CHECK NOT RECORDED",
    rationale: ["No claim rule matched the observed result set."],
    evidence: fallbackEvidence,
    evidenceDetails: fallbackEvidenceDetails,
  };
}
