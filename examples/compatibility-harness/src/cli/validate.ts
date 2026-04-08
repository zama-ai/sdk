import "dotenv/config";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import type { ReportArtifact } from "../report/schema.js";
import { parseReportArtifact } from "../report/parse.js";
import { resolveValidationConfig } from "./validate-config.js";
import { applyValidationPolicy, resolveValidationGate } from "./validate-policy.js";

function resolveReportPath(): { path: string; ephemeral: boolean } {
  const configured = (process.env.REPORT_JSON_PATH ?? "").trim();
  if (configured) return { path: configured, ephemeral: false };
  const generated = join(tmpdir(), `zama-harness-report-${Date.now()}-${process.pid}.json`);
  return { path: generated, ephemeral: true };
}

function runHarness(reportPath: string): number {
  const child = spawnSync("npm", ["test"], {
    stdio: "inherit",
    env: {
      ...process.env,
      REPORT_JSON_PATH: reportPath,
    },
  });

  if (child.error) {
    console.error(`validate: unable to run npm test: ${child.error.message}`);
    return 98;
  }
  if (typeof child.status === "number") {
    if (child.status !== 0) {
      console.error(`validate: npm test exited with code ${child.status}.`);
    }
    return child.status;
  }
  console.error("validate: npm test did not return a numeric exit status.");
  return 98;
}

function readArtifact(path: string): ReportArtifact {
  if (!existsSync(path)) {
    throw new Error(`Report artifact not found at ${path}.`);
  }
  const raw = readFileSync(path, "utf-8");
  return parseReportArtifact(raw);
}

function printValidationSummary(input: {
  target: string;
  reportPath: string;
  claimId: string;
  finalVerdict: string;
  decision: ReturnType<typeof resolveValidationGate>;
  effective: ReturnType<typeof applyValidationPolicy>;
  policyPath?: string;
}): void {
  console.log("\nValidation Gate");
  console.log("===============\n");
  console.log(`Target:       ${input.target}`);
  if (input.policyPath) {
    console.log(`Policy:       ${input.policyPath}`);
  }
  console.log(`Claim:        ${input.claimId}`);
  console.log(`Verdict:      ${input.finalVerdict}`);
  console.log(`Gate Status:  ${input.effective.status}`);
  console.log(`Summary:      ${input.effective.summary}`);
  if (input.effective.note) {
    console.log(`Policy note:  ${input.effective.note}`);
  }
  if (
    input.decision.status !== input.effective.status ||
    input.decision.exitCode !== input.effective.exitCode
  ) {
    console.log(`Base gate:    ${input.decision.status} (exit ${input.decision.exitCode})`);
  }
  console.log(`Exit code:    ${input.effective.exitCode}`);
  console.log(`Report JSON:  ${input.reportPath}\n`);
}

async function runValidate(): Promise<number> {
  let config: ReturnType<typeof resolveValidationConfig>;
  try {
    config = resolveValidationConfig(process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`validate: ${message}`);
    return 97;
  }

  const { path: reportPath, ephemeral } = resolveReportPath();
  const testExit = runHarness(reportPath);
  if (testExit !== 0) return testExit;

  try {
    const artifact = readArtifact(reportPath);
    const decision = resolveValidationGate(artifact.claim.id, config.target);
    const effective = applyValidationPolicy(decision, artifact.claim.id, config.policy);
    printValidationSummary({
      target: config.target,
      reportPath,
      claimId: artifact.claim.id,
      finalVerdict: artifact.finalVerdict,
      decision,
      effective,
      policyPath: config.policyPath,
    });
    return effective.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`validate: ${message}`);
    return 97;
  } finally {
    if (ephemeral && existsSync(reportPath)) {
      unlinkSync(reportPath);
    }
  }
}

runValidate()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`validate: unexpected failure: ${message}`);
    process.exitCode = 99;
  });
