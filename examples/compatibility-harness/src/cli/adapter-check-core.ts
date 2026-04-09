import { detectCapabilityContradictions } from "../adapter/contradictions.js";
import {
  ALL_CAPABILITIES,
  type AdapterArchitecture,
  type AdapterCapabilities,
  type CapabilityState,
  type VerificationModel,
} from "../adapter/types.js";
import { CHECK_REGISTRY, type CanonicalCheckId } from "../report/check-registry.js";

export type AdapterCheckSeverity = "PASS" | "WARN" | "FAIL";

export interface AdapterQualityInput {
  source: "adapter" | "legacy-signer";
  metadata: {
    name?: string;
    declaredArchitecture?: AdapterArchitecture;
    verificationModel?: VerificationModel;
    supportedChainIds?: number[];
  };
  declaredCapabilities: AdapterCapabilities;
  observedCapabilities: AdapterCapabilities;
  chainId: number;
}

export interface AdapterQualityCheck {
  id: string;
  severity: AdapterCheckSeverity;
  message: string;
  recommendation?: string;
}

export interface CanonicalCheckSupport {
  checkId: CanonicalCheckId;
  name: string;
  state: CapabilityState;
}

export interface AdapterQualityReport {
  checks: AdapterQualityCheck[];
  canonicalSupport: CanonicalCheckSupport[];
}

function isCapabilityState(value: string): value is CapabilityState {
  return value === "SUPPORTED" || value === "UNSUPPORTED" || value === "UNKNOWN";
}

function canonicalStateForCheck(
  checkId: CanonicalCheckId,
  capabilities: AdapterCapabilities,
  verificationModel?: VerificationModel,
): CapabilityState {
  switch (checkId) {
    case "ADAPTER_INITIALIZATION":
      return "SUPPORTED";
    case "ADDRESS_RESOLUTION":
      return capabilities.addressResolution;
    case "EIP712_SIGNING":
      return capabilities.eip712Signing;
    case "EIP712_RECOVERABILITY":
      return capabilities.recoverableEcdsa;
    case "ERC1271_VERIFICATION":
      return verificationModel === "ERC1271" ? "SUPPORTED" : "UNKNOWN";
    case "RAW_TRANSACTION_EXECUTION":
      return capabilities.rawTransactionSigning;
    case "ADAPTER_CONTRACT_READ":
      return capabilities.contractReads;
    case "ZAMA_AUTHORIZATION_FLOW":
      return capabilities.zamaAuthorizationFlow;
    case "ZAMA_WRITE_FLOW":
      return capabilities.zamaWriteFlow;
    case "ENVIRONMENT_CONFIGURATION":
    case "RPC_CONNECTIVITY":
    case "RELAYER_REACHABILITY":
    case "REGISTRY_TOKEN_DISCOVERY":
      return "UNKNOWN";
  }
}

function summarizeMetadata(input: AdapterQualityInput): AdapterQualityCheck[] {
  const checks: AdapterQualityCheck[] = [];
  const name = (input.metadata.name ?? "").trim();
  if (!name) {
    checks.push({
      id: "METADATA_NAME",
      severity: "FAIL",
      message: "Adapter metadata.name is missing or empty.",
      recommendation: "Set metadata.name to a stable adapter identifier.",
    });
  } else {
    checks.push({
      id: "METADATA_NAME",
      severity: "PASS",
      message: `metadata.name="${name}"`,
    });
  }

  if (!input.metadata.declaredArchitecture) {
    checks.push({
      id: "METADATA_ARCHITECTURE",
      severity: "WARN",
      message: "Adapter metadata.declaredArchitecture is missing.",
      recommendation:
        "Declare adapter architecture (EOA, MPC, SMART_ACCOUNT, API_ROUTED_EXECUTION, UNKNOWN).",
    });
  } else {
    checks.push({
      id: "METADATA_ARCHITECTURE",
      severity: "PASS",
      message: `declaredArchitecture=${input.metadata.declaredArchitecture}`,
    });
  }

  if (!input.metadata.verificationModel) {
    checks.push({
      id: "METADATA_VERIFICATION_MODEL",
      severity: "WARN",
      message: "Adapter metadata.verificationModel is missing.",
      recommendation:
        "Declare verificationModel (RECOVERABLE_ECDSA, ERC1271, PROVIDER_MANAGED, UNKNOWN).",
    });
  } else {
    checks.push({
      id: "METADATA_VERIFICATION_MODEL",
      severity: "PASS",
      message: `verificationModel=${input.metadata.verificationModel}`,
    });
  }

  const supportedChainIds = input.metadata.supportedChainIds ?? [];
  if (supportedChainIds.length === 0) {
    checks.push({
      id: "METADATA_CHAIN_IDS",
      severity: "WARN",
      message: "Adapter metadata.supportedChainIds is missing or empty.",
      recommendation: "Declare at least one supported chain id.",
    });
  } else if (!supportedChainIds.includes(input.chainId)) {
    checks.push({
      id: "METADATA_CHAIN_IDS",
      severity: "WARN",
      message: `Current chainId=${input.chainId} is not listed in supportedChainIds=[${supportedChainIds.join(", ")}].`,
      recommendation:
        "If this profile is intentional, switch NETWORK_PROFILE or update supportedChainIds.",
    });
  } else {
    checks.push({
      id: "METADATA_CHAIN_IDS",
      severity: "PASS",
      message: `supportedChainIds include current chainId (${input.chainId}).`,
    });
  }

  return checks;
}

function summarizeCapabilityShape(capabilities: AdapterCapabilities): AdapterQualityCheck[] {
  const checks: AdapterQualityCheck[] = [];
  for (const capability of ALL_CAPABILITIES) {
    const state = capabilities[capability];
    if (!isCapabilityState(state)) {
      checks.push({
        id: `CAPABILITY_${capability.toUpperCase()}`,
        severity: "FAIL",
        message: `${capability} has invalid state "${String(state)}".`,
        recommendation: 'Use one of: "SUPPORTED", "UNSUPPORTED", "UNKNOWN".',
      });
    }
  }
  if (checks.length === 0) {
    checks.push({
      id: "CAPABILITY_SHAPE",
      severity: "PASS",
      message: "Declared capability states are valid.",
    });
  }
  return checks;
}

function summarizeCapabilityConsistency(input: AdapterQualityInput): AdapterQualityCheck[] {
  const checks: AdapterQualityCheck[] = [];
  const declared = input.declaredCapabilities;
  const observed = input.observedCapabilities;

  const contradictions = detectCapabilityContradictions(declared, observed);
  if (contradictions.length === 0) {
    checks.push({
      id: "CAPABILITY_CONTRADICTIONS",
      severity: "PASS",
      message: "No declared/observed capability contradictions detected.",
    });
  } else {
    for (const contradiction of contradictions) {
      checks.push({
        id: "CAPABILITY_CONTRADICTIONS",
        severity: "FAIL",
        message: contradiction,
        recommendation:
          "Align declared capabilities with exposed adapter methods before running full validation.",
      });
    }
  }

  if (declared.zamaAuthorizationFlow === "SUPPORTED" && declared.eip712Signing !== "SUPPORTED") {
    checks.push({
      id: "CAPABILITY_AUTH_DEPENDENCY",
      severity: "FAIL",
      message: "zamaAuthorizationFlow=SUPPORTED requires eip712Signing=SUPPORTED.",
      recommendation:
        "Mark zamaAuthorizationFlow as unsupported, or implement/sign EIP-712 payloads.",
    });
  }

  if (declared.zamaWriteFlow === "SUPPORTED" && declared.contractExecution !== "SUPPORTED") {
    checks.push({
      id: "CAPABILITY_WRITE_DEPENDENCY",
      severity: "FAIL",
      message: "zamaWriteFlow=SUPPORTED requires contractExecution=SUPPORTED.",
      recommendation: "Mark zamaWriteFlow as unsupported, or implement writeContract routing.",
    });
  }

  if (declared.recoverableEcdsa === "SUPPORTED" && declared.eip712Signing !== "SUPPORTED") {
    checks.push({
      id: "CAPABILITY_RECOVERABILITY_DEPENDENCY",
      severity: "FAIL",
      message: "recoverableEcdsa=SUPPORTED requires eip712Signing=SUPPORTED.",
      recommendation: "Align recoverableEcdsa declaration with signing capability.",
    });
  }

  return checks;
}

export function evaluateAdapterQuality(input: AdapterQualityInput): AdapterQualityReport {
  const checks: AdapterQualityCheck[] = [];
  checks.push(...summarizeMetadata(input));
  checks.push(...summarizeCapabilityShape(input.declaredCapabilities));
  checks.push(...summarizeCapabilityConsistency(input));

  const canonicalSupport = CHECK_REGISTRY.filter((check) => !check.synthetic).map((check) => ({
    checkId: check.id,
    name: check.name,
    state: canonicalStateForCheck(
      check.id,
      input.declaredCapabilities,
      input.metadata.verificationModel,
    ),
  }));

  return { checks, canonicalSupport };
}

export function adapterQualityExitCode(report: AdapterQualityReport): number {
  return report.checks.some((check) => check.severity === "FAIL") ? 2 : 0;
}
