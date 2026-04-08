import type { RootCauseCategory, ValidationStatus } from "../adapter/types.js";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isEnvironmentIssue(message: string): boolean {
  return (
    message.includes("PRIVATE_KEY") ||
    message.includes("not set") ||
    message.includes("invalid") ||
    message.includes("Copy .env.example") ||
    message.includes("api key") ||
    message.includes("wallet locator")
  );
}

export function isRpcIssue(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rpc") ||
    lower.includes("nonce") ||
    lower.includes("gas price") ||
    lower.includes("http request failed") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("socket") ||
    lower.includes("timeout") ||
    lower.includes("dns")
  );
}

export function isRelayerIssue(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("relayer") || lower.includes("keypair") || lower.includes("credential");
}

export function isRegistryIssue(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("registry") || lower.includes("token pairs") || lower.includes("no token pairs")
  );
}

export function classifyInfrastructureIssue(message: string): {
  status: ValidationStatus;
  rootCauseCategory: RootCauseCategory;
} {
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
