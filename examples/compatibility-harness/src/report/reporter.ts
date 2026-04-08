import { appendFileSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ObservedAdapterProfile,
  RootCauseCategory,
  ValidationStatus,
  CapabilityState,
} from "../adapter/types.js";

export type TestStatus = ValidationStatus;
export type TestSection = "adapter" | "ethereum" | "execution" | "zama" | "environment";

export interface TestResult {
  name: string;
  section: TestSection;
  status: TestStatus;
  summary?: string;
  reason?: string;
  rootCauseCategory?: RootCauseCategory;
  likelyCause?: string;
  recommendation?: string;
}

export type AdapterProfile = ObservedAdapterProfile;

// Temp files shared across all vitest worker processes.
// Cleared by globalSetup at the start of each run.
const RESULTS_FILE = join(tmpdir(), "zama-harness-results.json");
const PROFILE_FILE = join(tmpdir(), "zama-harness-profile.json");

// ── Results ──────────────────────────────────────────────────────────────────

/** Append a test result to the shared results file. */
export function record(result: TestResult): void {
  appendFileSync(RESULTS_FILE, `${JSON.stringify(result)}\n`);
}

/** Read all recorded results. */
export function readResults(): TestResult[] {
  if (!existsSync(RESULTS_FILE)) return [];
  const raw = readFileSync(RESULTS_FILE, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return raw.map((line) => JSON.parse(line) as TestResult);
}

/** Delete the results file (called by globalSetup at the start of each run). */
export function clearResults(): void {
  if (existsSync(RESULTS_FILE)) unlinkSync(RESULTS_FILE);
}

// ── Signer profile ───────────────────────────────────────────────────────────

/** Record the signer profile (detected once, at the start of the run). */
export function recordProfile(profile: AdapterProfile): void {
  writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

/** Merge a partial profile update into the recorded adapter profile. */
export function mergeProfile(
  patch: Partial<Omit<AdapterProfile, "capabilities">> & {
    capabilities?: Partial<AdapterProfile["capabilities"]>;
  },
): void {
  const existing = readProfile();
  if (!existing) {
    if (
      !patch.name ||
      !patch.source ||
      !patch.declaredArchitecture ||
      !patch.detectedArchitecture
    ) {
      return;
    }
    recordProfile(patch as AdapterProfile);
    return;
  }
  writeFileSync(
    PROFILE_FILE,
    JSON.stringify(
      {
        ...existing,
        ...patch,
        capabilities: {
          ...existing.capabilities,
          ...patch.capabilities,
        },
      },
      null,
      2,
    ),
  );
}

/** Read the recorded signer profile. */
export function readProfile(): AdapterProfile | null {
  if (!existsSync(PROFILE_FILE)) return null;
  return JSON.parse(readFileSync(PROFILE_FILE, "utf-8")) as AdapterProfile;
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
  switch (status) {
    case "PASS":
      return "✓";
    case "FAIL":
      return "✗";
    case "BLOCKED":
      return "!";
    case "INCONCLUSIVE":
      return "?";
    case "UNSUPPORTED":
      return "–";
    case "UNTESTED":
      return "·";
  }
}

function renderCapability(state: CapabilityState): string {
  switch (state) {
    case "SUPPORTED":
      return "supported";
    case "UNSUPPORTED":
      return "unsupported";
    case "UNKNOWN":
      return "unknown";
  }
}

/** Print the final compatibility report to stdout. */
export function printReport(): void {
  const results = readResults();
  const profile = readProfile();
  if (results.length === 0 && profile === null) return;

  console.log(`\n${FULL}`);
  console.log("  Zama Compatibility Report");
  console.log(`${FULL}\n`);

  // ── Adapter profile ────────────────────────────────────────────────────────
  if (profile) {
    const shortAddr =
      profile.address.length > 20
        ? `${profile.address.slice(0, 10)}…${profile.address.slice(-8)}`
        : profile.address;
    console.log(`  Adapter            ${profile.name}`);
    console.log(`  Source             ${profile.source}`);
    console.log(`  Address            ${shortAddr}`);
    console.log(`  Declared Type      ${profile.declaredArchitecture}`);
    console.log(`  Detected Type      ${profile.detectedArchitecture}`);
    console.log(`  Verification       ${profile.verificationModel}`);
    console.log(`  Init               ${profile.initializationStatus}`);
    console.log(
      `  EIP-712            ${renderCapability(profile.capabilities.eip712Signing)} / recoverability ${renderCapability(profile.capabilities.recoverableEcdsa)}`,
    );
    console.log(
      `  Execution          rawTx ${renderCapability(profile.capabilities.rawTransactionSigning)} / write ${renderCapability(profile.capabilities.contractExecution)}`,
    );
    console.log(
      `  Reads & Receipts   reads ${renderCapability(profile.capabilities.contractReads)} / receipts ${renderCapability(profile.capabilities.transactionReceiptTracking)}`,
    );
    console.log(
      `  Zama Surface       auth ${renderCapability(profile.capabilities.zamaAuthorizationFlow)} / write ${renderCapability(profile.capabilities.zamaWriteFlow)}`,
    );
    console.log();
  }

  // ── Sections ───────────────────────────────────────────────────────────────
  const sections: { title: string; key: TestSection }[] = [
    { title: "Adapter Profile", key: "adapter" },
    { title: "Ethereum Compatibility", key: "ethereum" },
    { title: "Adapter-Routed Execution", key: "execution" },
    { title: "Zama SDK Compatibility", key: "zama" },
    { title: "Infrastructure / Environment", key: "environment" },
  ];

  for (const { title, key } of sections) {
    const sectionResults = results.filter((r) => r.section === key);
    if (sectionResults.length === 0) continue;

    const pad = Math.max(0, W - title.length - 5);
    console.log(`  ── ${title} ${"─".repeat(pad)}`);

    for (const r of sectionResults) {
      console.log(`  ${icon(r.status)} ${r.name.padEnd(36)} ${r.status}`);

      if (r.status === "FAIL") {
        if (r.summary) console.log(`      Summary:        ${r.summary}`);
        if (r.reason) console.log(`      Reason:         ${r.reason}`);
        if (r.rootCauseCategory) console.log(`      Root cause:     ${r.rootCauseCategory}`);
        if (r.likelyCause) console.log(`      Likely cause:   ${r.likelyCause}`);
        if (r.recommendation) console.log(`      Recommendation: ${r.recommendation}`);
        console.log();
      } else if (
        (r.status === "UNSUPPORTED" ||
          r.status === "UNTESTED" ||
          r.status === "BLOCKED" ||
          r.status === "INCONCLUSIVE") &&
        r.reason
      ) {
        if (r.summary) console.log(`      Summary:        ${r.summary}`);
        console.log(`      Note:           ${r.reason}`);
        if (r.rootCauseCategory) console.log(`      Root cause:     ${r.rootCauseCategory}`);
        if (r.recommendation) console.log(`      Recommendation: ${r.recommendation}`);
      }
    }
    console.log();
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  const zamaResults = results.filter((r) => r.section === "zama");
  const zamaFailed = zamaResults.filter((r) => r.status === "FAIL").length;
  const zamaBlocked = zamaResults.filter(
    (r) => r.status === "BLOCKED" || r.status === "INCONCLUSIVE",
  ).length;
  const zamaWrite = zamaResults.find((r) => r.name === "Zama Write Flow");
  const zamaAuthorization = zamaResults.find((r) => r.name === "Zama Authorization Flow");

  console.log(SUB);
  if (zamaFailed > 0) {
    console.log(`  Final: INCOMPATIBLE WITH VALIDATED ZAMA SURFACE ✗`);
  } else if (zamaBlocked > 0) {
    console.log(`  Final: INCONCLUSIVE — ZAMA VALIDATION BLOCKED`);
  } else if (zamaAuthorization?.status === "PASS" && zamaWrite?.status === "PASS") {
    console.log(`  Final: ZAMA-COMPATIBLE FOR AUTHORIZATION AND WRITE SURFACES ✓`);
  } else if (zamaAuthorization?.status === "PASS") {
    console.log(
      `  Final: PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE SURFACE NOT PROVEN`,
    );
  } else {
    console.log(`  Final: PARTIALLY VALIDATED — SEE SECTION RESULTS`);
  }
  console.log(`${FULL}\n`);
}
