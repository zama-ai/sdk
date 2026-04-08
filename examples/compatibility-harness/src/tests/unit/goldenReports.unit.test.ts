import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReportArtifact } from "../../report/parse.js";
import { resolveValidationGate } from "../../cli/validate-policy.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(THIS_DIR, "..", "fixtures", "report-artifacts");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("golden report fixtures", () => {
  it("keeps full-compatibility fixture parseable and gate-pass", () => {
    const report = parseReportArtifact(readFixture("eoa-full-compatible.report.json"));
    expect(report.claim.id).toBe("ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE");
    expect(resolveValidationGate(report.claim.id, "AUTHORIZATION")).toMatchObject({
      status: "PASS",
      exitCode: 0,
    });
    expect(resolveValidationGate(report.claim.id, "AUTHORIZATION_AND_WRITE")).toMatchObject({
      status: "PASS",
      exitCode: 0,
    });
  });

  it("keeps blocked fixture parseable and gate-inconclusive", () => {
    const report = parseReportArtifact(readFixture("turnkey-env-blocked.report.json"));
    expect(report.claim.id).toBe("INCONCLUSIVE_AUTHORIZATION_BLOCKED");
    expect(resolveValidationGate(report.claim.id, "AUTHORIZATION")).toMatchObject({
      status: "INCONCLUSIVE",
      exitCode: 30,
    });
  });

  it("rejects malformed artifacts", () => {
    expect(() => parseReportArtifact("{}")).toThrow(
      "Invalid report.kind: expected non-empty string.",
    );
  });

  it("rejects artifacts with inconsistent claim evidence", () => {
    const parsed = JSON.parse(readFixture("eoa-full-compatible.report.json")) as {
      claim: { evidence: Record<string, string> };
    };
    parsed.claim.evidence["Zama Write Flow"] = "FAIL";
    expect(() => parseReportArtifact(JSON.stringify(parsed))).toThrow(
      'Claim evidence mismatch for "Zama Write Flow"',
    );
  });
});
