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

function sectionCounts(results: TestResult[]): Record<TestStatus, number> {
  return {
    PASS: results.filter((r) => r.status === "PASS").length,
    FAIL: results.filter((r) => r.status === "FAIL").length,
    UNSUPPORTED: results.filter((r) => r.status === "UNSUPPORTED").length,
    UNTESTED: results.filter((r) => r.status === "UNTESTED").length,
    BLOCKED: results.filter((r) => r.status === "BLOCKED").length,
    INCONCLUSIVE: results.filter((r) => r.status === "INCONCLUSIVE").length,
  };
}

function testOrder(name: string): number {
  const ordered = [
    "Adapter Initialization",
    "Address Resolution",
    "EIP-712 Signing",
    "EIP-712 Recoverability",
    "Raw Transaction Execution",
    "Adapter Contract Read",
    "Zama Authorization Flow",
    "Zama Write Flow",
  ];
  const idx = ordered.indexOf(name);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function resolveFinalVerdict(zamaResults: TestResult[]): string {
  const authorization = zamaResults.find((r) => r.name === "Zama Authorization Flow");
  const write = zamaResults.find((r) => r.name === "Zama Write Flow");

  if (!authorization) {
    return "PARTIALLY VALIDATED — AUTHORIZATION CHECK NOT RECORDED";
  }

  if (authorization.status === "FAIL") {
    return "INCOMPATIBLE — ZAMA AUTHORIZATION FLOW FAILED";
  }

  if (authorization.status === "UNSUPPORTED") {
    return "INCOMPATIBLE — ADAPTER DOES NOT SUPPORT ZAMA AUTHORIZATION";
  }

  if (authorization.status === "BLOCKED" || authorization.status === "INCONCLUSIVE") {
    return "INCONCLUSIVE — AUTHORIZATION FLOW BLOCKED BY ENVIRONMENT OR INFRASTRUCTURE";
  }

  if (authorization.status === "UNTESTED") {
    return "INCONCLUSIVE — AUTHORIZATION FLOW NOT TESTED";
  }

  // Authorization passed from here.
  if (!write) {
    return "ZAMA COMPATIBLE FOR AUTHORIZATION FLOWS — WRITE FLOW NOT TESTED";
  }
  if (write.status === "PASS") {
    return "ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS";
  }
  if (write.status === "UNSUPPORTED") {
    return "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNSUPPORTED";
  }
  if (write.status === "UNTESTED") {
    return "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNTESTED";
  }
  if (write.status === "BLOCKED" || write.status === "INCONCLUSIVE") {
    return "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW BLOCKED";
  }
  return "INCOMPATIBLE — WRITE FLOW VALIDATION FAILED";
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
    console.log(`  Capability Source  declared + observed test updates`);
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
    sectionResults.sort((a, b) => testOrder(a.name) - testOrder(b.name));

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
    const counts = sectionCounts(sectionResults);
    const parts = [
      counts.PASS > 0 ? `${counts.PASS} PASS` : null,
      counts.FAIL > 0 ? `${counts.FAIL} FAIL` : null,
      counts.UNSUPPORTED > 0 ? `${counts.UNSUPPORTED} UNSUPPORTED` : null,
      counts.UNTESTED > 0 ? `${counts.UNTESTED} UNTESTED` : null,
      counts.BLOCKED > 0 ? `${counts.BLOCKED} BLOCKED` : null,
      counts.INCONCLUSIVE > 0 ? `${counts.INCONCLUSIVE} INCONCLUSIVE` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      console.log(`  Summary            ${parts.join(" · ")}`);
    }
    console.log();
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  const zamaResults = results.filter((r) => r.section === "zama");
  const verdict = resolveFinalVerdict(zamaResults);
  const blockerCounts = results
    .filter(
      (r) =>
        (r.status === "BLOCKED" || r.status === "INCONCLUSIVE") &&
        (r.rootCauseCategory === "ENVIRONMENT" ||
          r.rootCauseCategory === "RPC" ||
          r.rootCauseCategory === "RELAYER" ||
          r.rootCauseCategory === "REGISTRY"),
    )
    .reduce<Record<string, number>>((acc, r) => {
      const key = r.rootCauseCategory ?? "UNKNOWN";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  console.log(SUB);
  console.log(`  Final: ${verdict}`);
  if (Object.keys(blockerCounts).length > 0) {
    const rendered = Object.entries(blockerCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`  Blockers: ${rendered}`);
  }
  console.log(`${FULL}\n`);
}
