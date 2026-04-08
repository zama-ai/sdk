import type { DiagnosticCode, RootCauseCategory, ValidationStatus } from "../adapter/types.js";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalize(message: string): string {
  return message.toLowerCase();
}

function containsAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

export function isFundingIssue(message: string): boolean {
  const lower = normalize(message);
  return containsAny(lower, [
    "insufficient funds",
    "insufficient balance",
    "exceeds balance",
    "intrinsic gas too low",
  ]);
}

export function isEnvironmentIssue(message: string): boolean {
  const lower = normalize(message);
  return (
    containsAny(lower, [
      "private_key",
      "not set",
      "copy .env.example",
      "wallet locator",
      "turnkey_",
      "crossmint_",
      "openfort_",
      "relayer_api_key",
      "api key",
      "invalid private key",
      "invalid key",
      "invalid signature format",
    ]) || /[a-z0-9_]+\s+is not set/.test(lower)
  );
}

export function isRpcIssue(message: string): boolean {
  const lower = normalize(message);
  return containsAny(lower, [
    "rpc",
    "nonce too low",
    "replacement transaction underpriced",
    "gas price",
    "http request failed",
    "network",
    "fetch failed",
    "socket",
    "timeout",
    "timed out",
    "dns",
    "429",
    "rate limit",
    "econnrefused",
    "enotfound",
    "gateway timeout",
    "service unavailable",
  ]);
}

export function isRelayerIssue(message: string): boolean {
  const lower = normalize(message);
  return containsAny(lower, [
    "relayer",
    "keypair",
    "credential",
    "kms signer",
    "fhevm key",
    "authorization header",
  ]);
}

export function isRegistryIssue(message: string): boolean {
  const lower = normalize(message);
  return containsAny(lower, ["registry", "token pairs", "no token pairs", "pair not found"]);
}

export function classifyInfrastructureIssue(message: string): {
  status: ValidationStatus;
  rootCauseCategory: RootCauseCategory;
  errorCode: DiagnosticCode;
} {
  if (isFundingIssue(message)) {
    return {
      status: "BLOCKED",
      rootCauseCategory: "ENVIRONMENT",
      errorCode: "ENV_INSUFFICIENT_FUNDS",
    };
  }
  if (isEnvironmentIssue(message)) {
    const lower = normalize(message);
    const invalidPattern =
      lower.includes("invalid") || lower.includes("malformed") || lower.includes("mismatch");
    return {
      status: "BLOCKED",
      rootCauseCategory: "ENVIRONMENT",
      errorCode: invalidPattern ? "ENV_INVALID_CONFIG" : "ENV_MISSING_CONFIG",
    };
  }
  if (isRegistryIssue(message)) {
    return {
      status: "BLOCKED",
      rootCauseCategory: "REGISTRY",
      errorCode: normalize(message).includes("no token pairs")
        ? "REGISTRY_EMPTY"
        : "REGISTRY_UNAVAILABLE",
    };
  }
  if (isRelayerIssue(message)) {
    return {
      status: "INCONCLUSIVE",
      rootCauseCategory: "RELAYER",
      errorCode: "RELAYER_UNAVAILABLE",
    };
  }
  if (isRpcIssue(message)) {
    const lower = normalize(message);
    return {
      status: "INCONCLUSIVE",
      rootCauseCategory: "RPC",
      errorCode:
        lower.includes("429") || lower.includes("rate limit")
          ? "RPC_RATE_LIMIT"
          : "RPC_CONNECTIVITY",
    };
  }
  return {
    status: "INCONCLUSIVE",
    rootCauseCategory: "HARNESS",
    errorCode: "HARNESS_UNKNOWN",
  };
}
