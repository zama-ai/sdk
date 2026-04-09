import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  DiagnosticCode,
  ObservedAdapterProfile,
  RootCauseCategory,
  ValidationStatus,
  CapabilityState,
  AdapterCapabilities,
} from "../adapter/types.js";
import { emptyCapabilities } from "../adapter/types.js";
import { mergeCapabilityPatch, resolveFinalCapabilities } from "../adapter/capability-evidence.js";
import { inferRuntimeCapabilityPatchFromCheck } from "../adapter/runtime-observation.js";
import { detectCapabilityContradictions } from "../adapter/contradictions.js";
import { recommendationForDiagnostic } from "../harness/recommendations.js";
import {
  REPORT_KIND,
  REPORT_SCHEMA_VERSION,
  type InfraRootCause,
  type ReportArtifact,
  type ReportSection,
} from "./schema.js";
import {
  assertCanonicalCheck,
  checkOrder,
  getCanonicalCheckById,
  type CanonicalCheckId,
} from "./check-registry.js";
import { resolveClaimFromResults } from "../verdict/resolve.js";
import { assertClaimConsistency } from "../verdict/consistency.js";
import { resolveClaimConfidence } from "../verdict/confidence.js";

export type TestStatus = ValidationStatus;
export type TestSection = ReportSection;

export interface TestResult {
  checkId: CanonicalCheckId;
  name: string;
  section: TestSection;
  status: TestStatus;
  summary?: string;
  reason?: string;
  rootCauseCategory?: RootCauseCategory;
  errorCode?: DiagnosticCode;
  likelyCause?: string;
  recommendation?: string;
}

export type AdapterProfile = ObservedAdapterProfile;
export type WriteValidationDepth = "FULL" | "PARTIAL" | "UNTESTED";

interface ZamaWriteObservation {
  submissionAttempted: boolean;
  submissionSucceeded: boolean;
  receiptObserved: boolean;
  stateVerified: boolean;
}

// Temp files shared across all vitest worker processes.
// Cleared by globalSetup at the start of each run.
const RUN_ID = (process.env.ZAMA_HARNESS_RUN_ID ?? "default").replace(/[^a-zA-Z0-9._-]/g, "_");
const RESULTS_FILE = join(tmpdir(), `zama-harness-results-${RUN_ID}.jsonl`);
const PROFILE_FILE = join(tmpdir(), `zama-harness-profile-${RUN_ID}.json`);
const ZAMA_WRITE_OBSERVATION_FILE = join(tmpdir(), `zama-harness-zama-write-${RUN_ID}.json`);

const INFRA_ROOT_CAUSES = new Set<InfraRootCause>(["ENVIRONMENT", "RPC", "RELAYER", "REGISTRY"]);

function isInfraRootCause(category: RootCauseCategory | undefined): category is InfraRootCause {
  return category !== undefined && INFRA_ROOT_CAUSES.has(category as InfraRootCause);
}

// ── Results ──────────────────────────────────────────────────────────────────

/** Append a test result to the shared results file. */
export function record(result: TestResult): void {
  const recommendation = recommendationForDiagnostic({
    status: result.status,
    errorCode: result.errorCode,
    rootCauseCategory: result.rootCauseCategory,
  });
  const normalized: TestResult = recommendation ? { ...result, recommendation } : result;
  assertCanonicalCheck(normalized);
  appendFileSync(RESULTS_FILE, `${JSON.stringify(normalized)}\n`);
}

export function recordWithRuntimeObservation(
  result: TestResult,
  runtimeOverride: Partial<AdapterProfile["observedRuntimeCapabilities"]> = {},
): void {
  record(result);
  const inferred = inferRuntimeCapabilityPatchFromCheck({
    checkId: result.checkId,
    status: result.status,
  });
  const patch = {
    ...inferred,
    ...runtimeOverride,
  };
  if (Object.keys(patch).length === 0) return;
  mergeProfile({
    observedRuntimeCapabilities: patch,
  });
}

/** Read all recorded results. */
export function readResults(): TestResult[] {
  if (!existsSync(RESULTS_FILE)) return [];
  const raw = readFileSync(RESULTS_FILE, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return raw.map((line) => {
    const parsed = JSON.parse(line) as TestResult;
    assertCanonicalCheck(parsed);
    return parsed;
  });
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

function profileStructuralCapabilities(profile: AdapterProfile): AdapterCapabilities {
  return profile.observedStructuralCapabilities ?? profile.observedCapabilities;
}

function profileRuntimeCapabilities(profile: AdapterProfile): AdapterCapabilities {
  return profile.observedRuntimeCapabilities ?? emptyCapabilities();
}

/** Merge a partial profile update into the recorded adapter profile. */
export function mergeProfile(
  patch: Partial<
    Omit<
      AdapterProfile,
      | "declaredCapabilities"
      | "observedStructuralCapabilities"
      | "observedRuntimeCapabilities"
      | "observedCapabilities"
    >
  > & {
    declaredCapabilities?: Partial<AdapterProfile["declaredCapabilities"]>;
    observedStructuralCapabilities?: Partial<AdapterProfile["observedStructuralCapabilities"]>;
    observedRuntimeCapabilities?: Partial<AdapterProfile["observedRuntimeCapabilities"]>;
    // Backward-compatible alias for runtime observations.
    observedCapabilities?: Partial<AdapterProfile["observedCapabilities"]>;
  },
): void {
  const existing = readProfile();
  const runtimePatch = {
    ...patch.observedRuntimeCapabilities,
    ...patch.observedCapabilities,
  };
  if (!existing) {
    const hasCapabilityPatches =
      !!patch.declaredCapabilities ||
      !!patch.observedStructuralCapabilities ||
      Object.keys(runtimePatch).length > 0;
    const hasRequiredMetadata =
      !!patch.name &&
      !!patch.source &&
      !!patch.declaredArchitecture &&
      !!patch.detectedArchitecture;

    if (!hasRequiredMetadata && !hasCapabilityPatches) {
      return;
    }

    const declaredCapabilities = mergeCapabilityPatch({
      base: emptyCapabilities(),
      patch: patch.declaredCapabilities,
    });
    const observedStructuralCapabilities = mergeCapabilityPatch({
      base: emptyCapabilities(),
      patch: patch.observedStructuralCapabilities,
    });
    const observedRuntimeCapabilities = mergeCapabilityPatch({
      base: emptyCapabilities(),
      patch: runtimePatch,
    });
    const observedCapabilities = resolveFinalCapabilities({
      structural: observedStructuralCapabilities,
      runtime: observedRuntimeCapabilities,
    });

    recordProfile({
      name: patch.name ?? "(pending adapter profile)",
      source: patch.source ?? "adapter",
      declaredArchitecture: patch.declaredArchitecture ?? "UNKNOWN",
      detectedArchitecture: patch.detectedArchitecture ?? patch.declaredArchitecture ?? "UNKNOWN",
      verificationModel: patch.verificationModel ?? "UNKNOWN",
      address: patch.address ?? "(unresolved)",
      declaredCapabilities,
      observedStructuralCapabilities,
      observedRuntimeCapabilities,
      observedCapabilities,
      contradictions: detectCapabilityContradictions(declaredCapabilities, observedCapabilities),
      initializationStatus: patch.initializationStatus ?? "UNTESTED",
    });
    return;
  }
  const declaredCapabilities = mergeCapabilityPatch({
    base: existing.declaredCapabilities,
    patch: patch.declaredCapabilities,
  });
  const observedStructuralCapabilities = mergeCapabilityPatch({
    base: profileStructuralCapabilities(existing),
    patch: patch.observedStructuralCapabilities,
  });
  const observedRuntimeCapabilities = mergeCapabilityPatch({
    base: profileRuntimeCapabilities(existing),
    patch: runtimePatch,
  });
  const observedCapabilities = resolveFinalCapabilities({
    structural: observedStructuralCapabilities,
    runtime: observedRuntimeCapabilities,
  });

  writeFileSync(
    PROFILE_FILE,
    JSON.stringify(
      {
        ...existing,
        ...patch,
        declaredCapabilities,
        observedStructuralCapabilities,
        observedRuntimeCapabilities,
        observedCapabilities,
        contradictions: detectCapabilityContradictions(declaredCapabilities, observedCapabilities),
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

export function recordZamaWriteObservation(
  patch: Partial<ZamaWriteObservation>,
): ZamaWriteObservation {
  const existing = readZamaWriteObservation() ?? {
    submissionAttempted: false,
    submissionSucceeded: false,
    receiptObserved: false,
    stateVerified: false,
  };
  const next = {
    ...existing,
    ...patch,
  };
  writeFileSync(ZAMA_WRITE_OBSERVATION_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function readZamaWriteObservation(): ZamaWriteObservation | null {
  if (!existsSync(ZAMA_WRITE_OBSERVATION_FILE)) return null;
  return JSON.parse(readFileSync(ZAMA_WRITE_OBSERVATION_FILE, "utf-8")) as ZamaWriteObservation;
}

export function clearZamaWriteObservation(): void {
  if (existsSync(ZAMA_WRITE_OBSERVATION_FILE)) unlinkSync(ZAMA_WRITE_OBSERVATION_FILE);
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

function testOrder(checkId: CanonicalCheckId): number {
  return checkOrder(checkId);
}

function summarizeBlockers(results: TestResult[]): Partial<Record<InfraRootCause, number>> {
  return results
    .filter((r) => (r.status === "BLOCKED" || r.status === "INCONCLUSIVE") && r.rootCauseCategory)
    .filter((r): r is TestResult & { rootCauseCategory: InfraRootCause } => {
      return isInfraRootCause(r.rootCauseCategory);
    })
    .reduce<Partial<Record<InfraRootCause, number>>>((acc, result) => {
      const key = result.rootCauseCategory;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
}

function summarizeEnvironmentSection(results: TestResult[]): TestResult[] {
  const grouped = new Map<InfraRootCause, TestResult[]>();
  for (const result of results) {
    if (result.section === "environment") continue;
    if (!isInfraRootCause(result.rootCauseCategory)) continue;
    const category = result.rootCauseCategory;
    const bucket = grouped.get(category);
    if (bucket) {
      bucket.push(result);
      continue;
    }
    grouped.set(category, [result]);
  }

  const sections: TestResult[] = [];
  const categoryCheckId: Record<InfraRootCause, CanonicalCheckId> = {
    ENVIRONMENT: "ENVIRONMENT_CONFIGURATION",
    RPC: "RPC_CONNECTIVITY",
    RELAYER: "RELAYER_REACHABILITY",
    REGISTRY: "REGISTRY_TOKEN_DISCOVERY",
  };

  for (const [category, impacted] of grouped.entries()) {
    const checkId = categoryCheckId[category];
    const check = getCanonicalCheckById(checkId);
    const status: TestStatus = impacted.some((r) => r.status === "BLOCKED")
      ? "BLOCKED"
      : impacted.some((r) => r.status === "INCONCLUSIVE")
        ? "INCONCLUSIVE"
        : "UNTESTED";
    const checks = impacted.map((r) => r.name).join(", ");
    sections.push({
      checkId,
      name: check.name,
      section: "environment",
      status,
      summary: `${impacted.length} check(s) impacted by ${category.toLowerCase()}`,
      reason: checks,
      rootCauseCategory: category,
      recommendation:
        recommendationForDiagnostic({
          status,
          rootCauseCategory: category,
        }) ?? "Investigate environment dependencies and retry.",
    });
  }

  return sections;
}

export function deriveWriteValidationDepth(input: {
  zamaWriteStatus: TestStatus | null;
  observation: ZamaWriteObservation | null;
}): WriteValidationDepth {
  const { zamaWriteStatus, observation } = input;
  if (observation) {
    if (observation.submissionSucceeded && observation.stateVerified) {
      return "FULL";
    }
    if (
      observation.submissionAttempted ||
      observation.submissionSucceeded ||
      observation.receiptObserved
    ) {
      return "PARTIAL";
    }
  }

  if (zamaWriteStatus === "PASS") return "FULL";
  return "UNTESTED";
}

function exportJsonReport(payload: {
  profile: AdapterProfile | null;
  results: TestResult[];
  environmentSummary: TestResult[];
  verdict: ReturnType<typeof resolveClaimFromResults>;
  blockers: Partial<Record<InfraRootCause, number>>;
  writeValidationDepth: WriteValidationDepth;
}): void {
  const outputPath = (process.env.REPORT_JSON_PATH ?? "").trim();
  if (!outputPath) return;
  const allResults = [...payload.results, ...payload.environmentSummary];
  const artifact: ReportArtifact = {
    kind: REPORT_KIND,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    adapterProfile: payload.profile,
    checks: {
      recorded: payload.results,
      environmentSummary: payload.environmentSummary,
      all: allResults,
    },
    sections: {
      adapter: allResults.filter((r) => r.section === "adapter"),
      ethereum: allResults.filter((r) => r.section === "ethereum"),
      execution: allResults.filter((r) => r.section === "execution"),
      zama: allResults.filter((r) => r.section === "zama"),
      environment: allResults.filter((r) => r.section === "environment"),
    },
    infrastructure: {
      blockers: payload.blockers,
    },
    zama: {
      writeValidationDepth: payload.writeValidationDepth,
    },
    claim: payload.verdict,
    finalVerdict: payload.verdict.verdictLabel,
  };
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  [report] Failed to write REPORT_JSON_PATH (${outputPath}): ${message}`);
  }
}

/** Print the final compatibility report to stdout. */
export function printReport(): void {
  const baseResults = readResults();
  const profile = readProfile();
  if (baseResults.length === 0 && profile === null) return;

  const environmentSummary = summarizeEnvironmentSection(baseResults);
  const results = [...baseResults, ...environmentSummary];

  console.log(`\n${FULL}`);
  console.log("  Zama Compatibility Report");
  console.log(`${FULL}\n`);

  // ── Adapter profile ────────────────────────────────────────────────────────
  if (profile) {
    const structuralCapabilities = profileStructuralCapabilities(profile);
    const runtimeCapabilities = profileRuntimeCapabilities(profile);
    const finalCapabilities = profile.observedCapabilities;
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
    console.log(`  Capability Source  declared + structural + runtime + final`);
    console.log(
      `  EIP-712            declared ${renderCapability(profile.declaredCapabilities.eip712Signing)} / structural ${renderCapability(structuralCapabilities.eip712Signing)} / runtime ${renderCapability(runtimeCapabilities.eip712Signing)} / final ${renderCapability(finalCapabilities.eip712Signing)}`,
    );
    console.log(
      `  Recoverability     declared ${renderCapability(profile.declaredCapabilities.recoverableEcdsa)} / structural ${renderCapability(structuralCapabilities.recoverableEcdsa)} / runtime ${renderCapability(runtimeCapabilities.recoverableEcdsa)} / final ${renderCapability(finalCapabilities.recoverableEcdsa)}`,
    );
    console.log(
      `  Execution          rawTx ${renderCapability(finalCapabilities.rawTransactionSigning)} / write ${renderCapability(finalCapabilities.contractExecution)}`,
    );
    console.log(
      `  Reads & Receipts   reads ${renderCapability(finalCapabilities.contractReads)} / receipts ${renderCapability(finalCapabilities.transactionReceiptTracking)}`,
    );
    console.log(
      `  Zama Surface       auth ${renderCapability(finalCapabilities.zamaAuthorizationFlow)} / write ${renderCapability(finalCapabilities.zamaWriteFlow)}`,
    );
    if (profile.contradictions.length > 0) {
      console.log("  Contradictions");
      for (const contradiction of profile.contradictions) {
        console.log(`    - ${contradiction}`);
      }
    }
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
    sectionResults.sort((a, b) => testOrder(a.checkId) - testOrder(b.checkId));

    const pad = Math.max(0, W - title.length - 5);
    console.log(`  ── ${title} ${"─".repeat(pad)}`);

    for (const r of sectionResults) {
      console.log(`  ${icon(r.status)} ${r.name.padEnd(36)} ${r.status}`);

      if (r.status === "FAIL") {
        if (r.summary) console.log(`      Summary:        ${r.summary}`);
        if (r.reason) console.log(`      Reason:         ${r.reason}`);
        if (r.rootCauseCategory) console.log(`      Root cause:     ${r.rootCauseCategory}`);
        if (r.errorCode) console.log(`      Error code:     ${r.errorCode}`);
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
        if (r.errorCode) console.log(`      Error code:     ${r.errorCode}`);
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
  const verdict = resolveClaimFromResults(results);
  assertClaimConsistency(verdict, results);
  const blockerCounts = summarizeBlockers(results);
  const zamaWriteStatus =
    results.find((result) => result.checkId === "ZAMA_WRITE_FLOW")?.status ?? null;
  const writeValidationDepth = deriveWriteValidationDepth({
    zamaWriteStatus,
    observation: readZamaWriteObservation(),
  });
  const blockerCount = Object.values(blockerCounts).reduce((acc, count) => acc + (count ?? 0), 0);
  const confidence = resolveClaimConfidence({
    evidence: verdict.evidence,
    writeValidationDepth,
    blockerCount,
  });
  const verdictWithConfidence = {
    ...verdict,
    confidence,
  };

  console.log(SUB);
  console.log(`  Final: ${verdictWithConfidence.verdictLabel}`);
  console.log(`  Write Validation Depth: ${writeValidationDepth}`);
  console.log(`  Confidence: ${confidence}`);
  console.log(`  Claim: ${verdictWithConfidence.id}`);
  for (const line of verdictWithConfidence.rationale) {
    console.log(`  Why:   ${line}`);
  }
  if (Object.keys(blockerCounts).length > 0) {
    const rendered = Object.entries(blockerCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`  Blockers: ${rendered}`);
  }
  const jsonPath = (process.env.REPORT_JSON_PATH ?? "").trim();
  if (jsonPath) {
    console.log(`  JSON: ${jsonPath}`);
  }
  console.log(`${FULL}\n`);

  exportJsonReport({
    profile,
    results: baseResults,
    environmentSummary,
    verdict: verdictWithConfidence,
    blockers: blockerCounts,
    writeValidationDepth,
  });
}
