import type { DiagnosticCode, RootCauseCategory, ValidationStatus } from "../adapter/types.js";

interface RecommendationDescriptor {
  text: string;
  nextCommand?: string;
}

const ERROR_CODE_RECOMMENDATIONS: Record<DiagnosticCode, RecommendationDescriptor> = {
  ENV_MISSING_CONFIG: {
    text: "Set the required environment variables and credentials for your adapter.",
    nextCommand: "npm run doctor",
  },
  ENV_INVALID_CONFIG: {
    text: "Fix invalid environment values (keys, addresses, URLs, or IDs).",
    nextCommand: "npm run doctor",
  },
  ENV_INSUFFICIENT_FUNDS: {
    text: "Fund the adapter wallet with enough native token to cover gas.",
    nextCommand: "npm run validate",
  },
  RPC_CONNECTIVITY: {
    text: "Check RPC_URL/network reachability and retry once connectivity is stable.",
    nextCommand: "npm run doctor",
  },
  RPC_RATE_LIMIT: {
    text: "Use a less constrained RPC endpoint or reduce request concurrency.",
    nextCommand: "npm run doctor",
  },
  RELAYER_UNAVAILABLE: {
    text: "Verify relayer URL/API key and relayer service health.",
    nextCommand: "npm run doctor",
  },
  REGISTRY_EMPTY: {
    text: "No compatible token pair was found for the selected network.",
    nextCommand: "npm run validate",
  },
  REGISTRY_UNAVAILABLE: {
    text: "Ensure registry services are reachable on the selected network.",
    nextCommand: "npm run validate",
  },
  HARNESS_UNKNOWN: {
    text: "Inspect the underlying error and harness logs to isolate the failure source.",
    nextCommand: "npm test",
  },
};

const ROOT_CAUSE_RECOMMENDATIONS: Partial<Record<RootCauseCategory, RecommendationDescriptor>> = {
  ENVIRONMENT: {
    text: "Fix local configuration and credentials before rerunning compatibility checks.",
    nextCommand: "npm run doctor",
  },
  RPC: {
    text: "Validate RPC endpoint health and network reachability.",
    nextCommand: "npm run doctor",
  },
  RELAYER: {
    text: "Validate relayer endpoint health and authentication settings.",
    nextCommand: "npm run doctor",
  },
  REGISTRY: {
    text: "Verify token registry availability and network selection.",
    nextCommand: "npm run validate",
  },
  HARNESS: {
    text: "Investigate harness/runtime logs to determine the blocking condition.",
    nextCommand: "npm test",
  },
};

function withNextCommand(descriptor: RecommendationDescriptor): string {
  if (!descriptor.nextCommand) return descriptor.text;
  return `${descriptor.text} Next: \`${descriptor.nextCommand}\`.`;
}

function isActionablyBlockedStatus(status: ValidationStatus): boolean {
  return status === "BLOCKED" || status === "INCONCLUSIVE";
}

export function recommendationForDiagnostic(input: {
  status: ValidationStatus;
  errorCode?: DiagnosticCode;
  rootCauseCategory?: RootCauseCategory;
}): string | undefined {
  if (!isActionablyBlockedStatus(input.status)) return undefined;
  if (input.errorCode) {
    return withNextCommand(ERROR_CODE_RECOMMENDATIONS[input.errorCode]);
  }
  if (input.rootCauseCategory) {
    const fallback = ROOT_CAUSE_RECOMMENDATIONS[input.rootCauseCategory];
    if (fallback) return withNextCommand(fallback);
  }
  return undefined;
}
