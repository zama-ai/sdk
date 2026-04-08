import { REPORT_KIND, REPORT_SCHEMA_VERSION, type ReportArtifact } from "./schema.js";

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
  if (schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion "${schemaVersion}". Expected "${REPORT_SCHEMA_VERSION}".`,
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

  const checks = asRecord(object.checks);
  if (!checks) {
    throw new Error("Invalid report.checks: expected object.");
  }
  for (const required of ["recorded", "environmentSummary", "all"]) {
    if (!Array.isArray(checks[required])) {
      throw new Error(`Invalid report.checks.${required}: expected array.`);
    }
  }

  const sections = asRecord(object.sections);
  if (!sections) {
    throw new Error("Invalid report.sections: expected object.");
  }
  for (const required of ["adapter", "ethereum", "execution", "zama", "environment"]) {
    if (!Array.isArray(sections[required])) {
      throw new Error(`Invalid report.sections.${required}: expected array.`);
    }
  }

  const infrastructure = asRecord(object.infrastructure);
  if (!infrastructure) {
    throw new Error("Invalid report.infrastructure: expected object.");
  }
  const blockers = infrastructure.blockers;
  if (!asRecord(blockers)) {
    throw new Error("Invalid report.infrastructure.blockers: expected object.");
  }

  return object as unknown as ReportArtifact;
}
