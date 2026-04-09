import {
  REPORT_KIND,
  REPORT_SCHEMA_VERSION,
  SUPPORTED_REPORT_SCHEMA_VERSIONS,
  type ReportArtifact,
  type ReportSection,
} from "./schema.js";
import { assertCanonicalCheck, isCanonicalCheckId } from "./check-registry.js";
import { assertClaimConsistency } from "../verdict/consistency.js";
import type { ValidationStatus } from "../adapter/types.js";

const VALID_STATUSES = new Set<ValidationStatus>([
  "PASS",
  "FAIL",
  "UNTESTED",
  "UNSUPPORTED",
  "BLOCKED",
  "INCONCLUSIVE",
]);
const VALID_CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);
const VALID_WRITE_DEPTH = new Set(["FULL", "PARTIAL", "UNTESTED"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertStringField(
  object: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = object[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${context}.${field}: expected non-empty string.`);
  }
  return value;
}

function assertCheckArray(value: unknown, context: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${context}: expected array.`);
  }

  for (let i = 0; i < value.length; i += 1) {
    const check = asRecord(value[i]);
    if (!check) {
      throw new Error(`Invalid ${context}[${i}]: expected object.`);
    }
    const checkId = assertStringField(check, "checkId", `${context}[${i}]`);
    if (!isCanonicalCheckId(checkId)) {
      throw new Error(`Invalid ${context}[${i}].checkId: unknown id "${checkId}".`);
    }
    const name = assertStringField(check, "name", `${context}[${i}]`);
    const section = assertStringField(check, "section", `${context}[${i}]`);
    const status = assertStringField(check, "status", `${context}[${i}]`);
    if (!VALID_STATUSES.has(status as ValidationStatus)) {
      throw new Error(`Invalid ${context}[${i}].status: unsupported status "${status}".`);
    }
    assertCanonicalCheck({
      checkId,
      name,
      section: section as ReportSection,
    });
  }
}

export function parseReportArtifact(raw: string): ReportArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Report artifact is not valid JSON.");
  }

  const object = asRecord(parsed);
  if (!object) {
    throw new Error("Report artifact must be a JSON object.");
  }

  const kind = assertStringField(object, "kind", "report");
  if (kind !== REPORT_KIND) {
    throw new Error(`Unexpected report kind "${kind}". Expected "${REPORT_KIND}".`);
  }

  const schemaVersion = assertStringField(object, "schemaVersion", "report");
  if (
    !SUPPORTED_REPORT_SCHEMA_VERSIONS.includes(
      schemaVersion as (typeof SUPPORTED_REPORT_SCHEMA_VERSIONS)[number],
    )
  ) {
    const supported = SUPPORTED_REPORT_SCHEMA_VERSIONS.join(", ");
    throw new Error(
      `Unsupported schemaVersion "${schemaVersion}". Supported versions: ${supported}.`,
    );
  }

  assertStringField(object, "generatedAt", "report");
  assertStringField(object, "runId", "report");
  assertStringField(object, "finalVerdict", "report");

  const claim = asRecord(object.claim);
  if (!claim) {
    throw new Error("Invalid report.claim: expected object.");
  }
  assertStringField(claim, "id", "report.claim");
  assertStringField(claim, "verdictLabel", "report.claim");

  const rationale = claim.rationale;
  if (
    !Array.isArray(rationale) ||
    rationale.length === 0 ||
    rationale.some((v) => typeof v !== "string")
  ) {
    throw new Error("Invalid report.claim.rationale: expected non-empty string array.");
  }

  const evidence = asRecord(claim.evidence);
  if (!evidence) {
    throw new Error("Invalid report.claim.evidence: expected object.");
  }
  if (schemaVersion === REPORT_SCHEMA_VERSION) {
    const confidence = assertStringField(claim, "confidence", "report.claim");
    if (!VALID_CONFIDENCE.has(confidence)) {
      throw new Error(`Invalid report.claim.confidence: unsupported value "${confidence}".`);
    }
  }
  const evidenceDetails = claim.evidenceDetails;
  if (evidenceDetails !== undefined) {
    if (!Array.isArray(evidenceDetails)) {
      throw new Error("Invalid report.claim.evidenceDetails: expected array when provided.");
    }
    for (let i = 0; i < evidenceDetails.length; i += 1) {
      const detail = asRecord(evidenceDetails[i]);
      if (!detail) {
        throw new Error(`Invalid report.claim.evidenceDetails[${i}]: expected object.`);
      }
      assertStringField(detail, "check", `report.claim.evidenceDetails[${i}]`);
      assertStringField(detail, "checkId", `report.claim.evidenceDetails[${i}]`);
      assertStringField(detail, "status", `report.claim.evidenceDetails[${i}]`);
      assertStringField(detail, "reasonCategory", `report.claim.evidenceDetails[${i}]`);
    }
  }

  const checks = asRecord(object.checks);
  if (!checks) {
    throw new Error("Invalid report.checks: expected object.");
  }
  for (const required of ["recorded", "environmentSummary", "all"]) {
    assertCheckArray(checks[required], `report.checks.${required}`);
  }

  const sections = asRecord(object.sections);
  if (!sections) {
    throw new Error("Invalid report.sections: expected object.");
  }
  for (const required of ["adapter", "ethereum", "execution", "zama", "environment"]) {
    assertCheckArray(sections[required], `report.sections.${required}`);
  }

  const infrastructure = asRecord(object.infrastructure);
  if (!infrastructure) {
    throw new Error("Invalid report.infrastructure: expected object.");
  }
  const blockers = infrastructure.blockers;
  if (!asRecord(blockers)) {
    throw new Error("Invalid report.infrastructure.blockers: expected object.");
  }

  if (schemaVersion === REPORT_SCHEMA_VERSION) {
    const zama = asRecord(object.zama);
    if (!zama) {
      throw new Error("Invalid report.zama: expected object for schema 1.3.0.");
    }
    const writeValidationDepth = assertStringField(zama, "writeValidationDepth", "report.zama");
    if (!VALID_WRITE_DEPTH.has(writeValidationDepth)) {
      throw new Error(
        `Invalid report.zama.writeValidationDepth: unsupported value "${writeValidationDepth}".`,
      );
    }
  }

  assertClaimConsistency(
    claim as unknown as ReportArtifact["claim"],
    checks.all as unknown as ReportArtifact["checks"]["all"],
  );

  return object as unknown as ReportArtifact;
}
