import type { EIP712TypedData, FhevmInstanceConfig } from "./relayer-sdk.types";
import { mergeFhevmConfig } from "./relayer-configs";

export { mergeFhevmConfig };

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Retry an async operation with exponential backoff.
 * Only retries on transient errors (timeout, network). Does not retry user-facing errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientError(error)) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** EIP-712 domain field → Solidity type. Order follows the EIP-712 spec. */
const DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/**
 * Build `EIP712Domain` type entries from the keys present in a domain object.
 * Order matches the EIP-712 spec (name → version → chainId → verifyingContract → salt).
 */
export function buildEIP712DomainType(
  domain: EIP712TypedData["domain"],
): Array<{ name: string; type: string }> {
  return Object.keys(DOMAIN_FIELD_TYPES)
    .filter((k) => k in domain)
    .map((k) => ({ name: k, type: DOMAIN_FIELD_TYPES[k]! }));
}
