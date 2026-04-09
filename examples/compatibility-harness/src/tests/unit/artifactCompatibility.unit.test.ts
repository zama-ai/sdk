import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReportArtifact } from "../../report/parse.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(THIS_DIR, "..", "fixtures", "report-artifacts");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("report artifact compatibility contract", () => {
  it("accepts current schema fixtures", () => {
    expect(() => parseReportArtifact(readFixture("eoa-full-compatible.report.json"))).not.toThrow();
    expect(() => parseReportArtifact(readFixture("turnkey-env-blocked.report.json"))).not.toThrow();
  });

  it("accepts legacy 1.2 fixtures during transition", () => {
    expect(() => parseReportArtifact(readFixture("legacy-schema-1.2.report.json"))).not.toThrow();
  });

  it("rejects legacy schema versions with explicit error", () => {
    expect(() => parseReportArtifact(readFixture("legacy-schema-1.1.report.json"))).toThrow(
      'Unsupported schemaVersion "1.1.0". Supported versions: 1.2.0, 1.3.0.',
    );
  });

  it("rejects malformed checks missing canonical checkId", () => {
    expect(() =>
      parseReportArtifact(readFixture("malformed-missing-check-id.report.json")),
    ).toThrow("Invalid report.checks.recorded[0].checkId: expected non-empty string.");
  });

  it("rejects claim requirements that contradict observed statuses", () => {
    expect(() =>
      parseReportArtifact(readFixture("malformed-claim-requirement-mismatch.report.json")),
    ).toThrow('requirement "Zama Authorization Flow" not satisfied');
  });

  it("rejects schema 1.3 artifacts missing confidence/write-depth fields", () => {
    const parsed = JSON.parse(readFixture("eoa-full-compatible.report.json")) as {
      claim: Record<string, unknown>;
      zama: Record<string, unknown>;
    };
    delete parsed.claim.confidence;
    expect(() => parseReportArtifact(JSON.stringify(parsed))).toThrow(
      "Invalid report.claim.confidence: expected non-empty string.",
    );

    const parsedWithoutDepth = JSON.parse(readFixture("eoa-full-compatible.report.json")) as {
      claim: Record<string, unknown>;
      zama: Record<string, unknown>;
    };
    delete parsedWithoutDepth.zama.writeValidationDepth;
    expect(() => parseReportArtifact(JSON.stringify(parsedWithoutDepth))).toThrow(
      "Invalid report.zama.writeValidationDepth: expected non-empty string.",
    );
  });
});
