import "dotenv/config";
import { errorMessage } from "../harness/diagnostics.js";
import {
  adapterQualityExitCode,
  evaluateAdapterQuality,
  type AdapterQualityReport,
} from "./adapter-check-core.js";

function icon(severity: "PASS" | "WARN" | "FAIL"): string {
  if (severity === "PASS") return "✓";
  if (severity === "WARN") return "!";
  return "✗";
}

function printReport(input: { name: string; source: string; report: AdapterQualityReport }): void {
  const passes = input.report.checks.filter((check) => check.severity === "PASS").length;
  const warns = input.report.checks.filter((check) => check.severity === "WARN").length;
  const fails = input.report.checks.filter((check) => check.severity === "FAIL").length;

  console.log("\nAdapter Quality Report");
  console.log("======================\n");
  console.log(`Adapter: ${input.name}`);
  console.log(`Source:  ${input.source}\n`);

  for (const check of input.report.checks) {
    console.log(`${icon(check.severity)} ${check.severity} ${check.id}`);
    console.log(`  ${check.message}`);
    if (check.recommendation) {
      console.log(`  Recommendation: ${check.recommendation}`);
    }
  }

  console.log("\nCanonical Check Support");
  console.log("-----------------------");
  for (const check of input.report.canonicalSupport) {
    console.log(`- ${check.checkId}: ${check.state} (${check.name})`);
  }

  console.log("");
  console.log(`Summary: ${passes} PASS, ${warns} WARN, ${fails} FAIL`);
}

async function runAdapterCheck(): Promise<number> {
  try {
    const [harness, config] = await Promise.all([
      import("../harness/adapter.js"),
      import("../config/network.js"),
    ]);
    const report = evaluateAdapterQuality({
      source: harness.adapterSource,
      metadata: harness.adapter.metadata,
      declaredCapabilities: harness.adapterDeclaredCapabilities,
      observedCapabilities: harness.adapterObservedCapabilities,
      chainId: config.networkConfig.chainId,
    });
    printReport({
      name: harness.adapter.metadata.name,
      source: harness.adapterSource,
      report,
    });
    return adapterQualityExitCode(report);
  } catch (error) {
    console.error(`adapter:check failed: ${errorMessage(error)}`);
    return 2;
  }
}

runAdapterCheck()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`adapter:check failed unexpectedly: ${errorMessage(error)}`);
    process.exitCode = 99;
  });
