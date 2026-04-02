import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestStatus = "PASS" | "FAIL" | "SKIP";

export interface TestResult {
  name: string;
  status: TestStatus;
  reason?: string;
  likelyCause?: string;
  recommendation?: string;
}

// Temp file shared across all vitest worker processes.
// Cleared by globalSetup at the start of each run.
const RESULTS_FILE = join(tmpdir(), "zama-harness-results.json");

/** Append a test result to the shared results file. */
export function record(result: TestResult): void {
  const existing: TestResult[] = existsSync(RESULTS_FILE)
    ? (JSON.parse(readFileSync(RESULTS_FILE, "utf-8")) as TestResult[])
    : [];
  existing.push(result);
  writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2));
}

/** Read all recorded results. */
export function readResults(): TestResult[] {
  if (!existsSync(RESULTS_FILE)) return [];
  return JSON.parse(readFileSync(RESULTS_FILE, "utf-8")) as TestResult[];
}

/** Delete the results file (called by globalSetup at the start of each run). */
export function clearResults(): void {
  if (existsSync(RESULTS_FILE)) unlinkSync(RESULTS_FILE);
}

/** Print the final compatibility report to stdout. */
export function printReport(): void {
  const results = readResults();
  if (results.length === 0) return;

  const line = "━".repeat(54);

  console.log("\n" + line);
  console.log("  Zama Compatibility Report");
  console.log(line + "\n");

  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "–";
    const label = r.name.padEnd(32);
    console.log(`  ${icon} ${label} ${r.status}`);

    if (r.status === "FAIL") {
      if (r.reason) console.log(`      Reason:         ${r.reason}`);
      if (r.likelyCause) console.log(`      Likely cause:   ${r.likelyCause}`);
      if (r.recommendation) console.log(`      Recommendation: ${r.recommendation}`);
      console.log();
    }
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const total = results.filter((r) => r.status !== "SKIP").length;

  console.log(line);
  if (failed === 0) {
    console.log(`  Final: COMPATIBLE (${total}/${total} tests passed)`);
  } else {
    console.log(`  Final: INCOMPATIBLE (${failed} of ${total} tests failed)`);
  }
  console.log(line + "\n");
}
