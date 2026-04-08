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

  it("rejects legacy schema versions with explicit error", () => {
    expect(() => parseReportArtifact(readFixture("legacy-schema-1.1.report.json"))).toThrow(
      'Unsupported schemaVersion "1.1.0". Expected "1.2.0".',
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
});
