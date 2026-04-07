import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestStatus = "PASS" | "FAIL" | "SKIP";
export type TestSection = "ethereum" | "zama";

export interface TestResult {
  name: string;
  section: TestSection;
  status: TestStatus;
  reason?: string;
  likelyCause?: string;
  recommendation?: string;
}

export interface SignerProfile {
  address: string;
  detectedType: "EOA" | "MPC" | "Smart Account" | "Unknown";
  eip712Recoverable: boolean;
  hasSignTransaction: boolean;
  hasWriteContract: boolean;
}

// Temp files shared across all vitest worker processes.
// Cleared by globalSetup at the start of each run.
const RESULTS_FILE = join(tmpdir(), "zama-harness-results.json");
const PROFILE_FILE = join(tmpdir(), "zama-harness-profile.json");

// ── Results ──────────────────────────────────────────────────────────────────

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

// ── Signer profile ───────────────────────────────────────────────────────────

/** Record the signer profile (detected once, at the start of the run). */
export function recordProfile(profile: SignerProfile): void {
  writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

/** Read the recorded signer profile. */
export function readProfile(): SignerProfile | null {
  if (!existsSync(PROFILE_FILE)) return null;
  return JSON.parse(readFileSync(PROFILE_FILE, "utf-8")) as SignerProfile;
}

/** Delete the profile file (called by globalSetup at the start of each run). */
export function clearProfile(): void {
  if (existsSync(PROFILE_FILE)) unlinkSync(PROFILE_FILE);
}

// ── Report ───────────────────────────────────────────────────────────────────

const W = 56;
const FULL = "━".repeat(W);
const SUB = "─".repeat(W);

function icon(status: TestStatus): string {
  return status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "–";
}

/** Print the final compatibility report to stdout. */
export function printReport(): void {
  const results = readResults();
  const profile = readProfile();
  if (results.length === 0 && profile === null) return;

  console.log(`\n${FULL}`);
  console.log("  Zama Compatibility Report");
  console.log(`${FULL}\n`);

  // ── Signer profile ─────────────────────────────────────────────────────────
  if (profile) {
    const shortAddr =
      profile.address.length > 20
        ? `${profile.address.slice(0, 10)}…${profile.address.slice(-8)}`
        : profile.address;
    console.log(`  Signer             ${shortAddr}`);
    console.log(`  Type               ${profile.detectedType}`);
    console.log(
      `  EIP-712            ${profile.eip712Recoverable ? "✓ recoverable (secp256k1)" : "✗ not recoverable — non-EOA signature format"}`,
    );
    console.log(
      `  signTransaction    ${profile.hasSignTransaction ? "✓ provided (EOA path)" : "– not provided"}`,
    );
    console.log(
      `  writeContract      ${profile.hasWriteContract ? "✓ provided (MPC / smart-account path)" : "– not provided"}`,
    );
    console.log();
  }

  // ── Sections ───────────────────────────────────────────────────────────────
  const sections: { title: string; key: TestSection }[] = [
    { title: "Ethereum Compatibility", key: "ethereum" },
    { title: "Zama SDK Compatibility", key: "zama" },
  ];

  for (const { title, key } of sections) {
    const sectionResults = results.filter((r) => r.section === key);
    if (sectionResults.length === 0) continue;

    const pad = Math.max(0, W - title.length - 5);
    console.log(`  ── ${title} ${"─".repeat(pad)}`);

    for (const r of sectionResults) {
      console.log(`  ${icon(r.status)} ${r.name.padEnd(36)} ${r.status}`);

      if (r.status === "FAIL") {
        if (r.reason) console.log(`      Reason:         ${r.reason}`);
        if (r.likelyCause) console.log(`      Likely cause:   ${r.likelyCause}`);
        if (r.recommendation) console.log(`      Recommendation: ${r.recommendation}`);
        console.log();
      } else if (r.status === "SKIP" && r.reason) {
        console.log(`      Note:           ${r.reason}`);
      }
    }
    console.log();
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  const zamaResults = results.filter((r) => r.section === "zama");
  const zamaFailed = zamaResults.filter((r) => r.status === "FAIL").length;
  const ethSkipped = results.filter((r) => r.section === "ethereum" && r.status === "SKIP").length;

  console.log(SUB);
  if (zamaFailed === 0) {
    if (ethSkipped > 0) {
      const noun = ethSkipped === 1 ? "test" : "tests";
      console.log(`  Final: ZAMA COMPATIBLE ✓`);
      console.log(
        `  Note:  ${ethSkipped} Ethereum ${noun} skipped — not required for Zama SDK compatibility`,
      );
    } else {
      console.log(`  Final: ZAMA COMPATIBLE ✓`);
    }
  } else {
    const noun = zamaFailed === 1 ? "test" : "tests";
    console.log(`  Final: NOT ZAMA COMPATIBLE ✗  (${zamaFailed} Zama ${noun} failed)`);
  }
  console.log(`${FULL}\n`);
}
