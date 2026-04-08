import type { RootCauseCategory, ValidationStatus } from "../adapter/types.js";

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
} {
  if (isFundingIssue(message)) {
    return { status: "BLOCKED", rootCauseCategory: "ENVIRONMENT" };
  }
  if (isEnvironmentIssue(message)) {
    return { status: "BLOCKED", rootCauseCategory: "ENVIRONMENT" };
  }
  if (isRegistryIssue(message)) {
    return { status: "BLOCKED", rootCauseCategory: "REGISTRY" };
  }
  if (isRelayerIssue(message)) {
    return { status: "INCONCLUSIVE", rootCauseCategory: "RELAYER" };
  }
  if (isRpcIssue(message)) {
    return { status: "INCONCLUSIVE", rootCauseCategory: "RPC" };
  }
  return { status: "INCONCLUSIVE", rootCauseCategory: "HARNESS" };
}
