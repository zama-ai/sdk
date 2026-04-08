import type {
  DiagnosticCode,
  ObservedAdapterProfile,
  RootCauseCategory,
  ValidationStatus,
} from "../adapter/types.js";
import type { ClaimResolution } from "../verdict/types.js";
import type { CanonicalCheckId } from "./check-registry.js";

export const REPORT_KIND = "zama-compatibility-report" as const;
export const REPORT_SCHEMA_VERSION = "1.2.0" as const;

export type ReportSection = "adapter" | "ethereum" | "execution" | "zama" | "environment";
export type InfraRootCause = Extract<
  RootCauseCategory,
  "ENVIRONMENT" | "RPC" | "RELAYER" | "REGISTRY"
>;

export interface ReportCheck {
  checkId: CanonicalCheckId;
  name: string;
  section: ReportSection;
  status: ValidationStatus;
  summary?: string;
  reason?: string;
  rootCauseCategory?: RootCauseCategory;
  errorCode?: DiagnosticCode;
  likelyCause?: string;
  recommendation?: string;
}

export interface ReportArtifact {
  kind: typeof REPORT_KIND;
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAt: string;
  runId: string;
  adapterProfile: ObservedAdapterProfile | null;
  checks: {
    recorded: ReportCheck[];
    environmentSummary: ReportCheck[];
    all: ReportCheck[];
  };
  sections: Record<ReportSection, ReportCheck[]>;
  infrastructure: {
    blockers: Partial<Record<InfraRootCause, number>>;
  };
  claim: ClaimResolution;
  finalVerdict: string;
}
