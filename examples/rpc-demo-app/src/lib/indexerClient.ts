import { INDEXER_URL } from "@/lib/config";

/** confidential-indexer's REST responses — same shapes as its own tests/router.ts. */
export interface BalanceResponse {
  delegator: string;
  contractAddress: string;
  encryptedValue: string;
  clearValue: string;
  decryptedAtBlock: string;
}
export interface TransferEntry {
  contractAddress: string;
  from: string;
  to: string;
  encryptedAmount: string;
  clearAmount: string;
  blockNumber: string;
  transactionHash: string;
}
export interface DelegationEntry {
  delegator: string;
  contractAddress: string;
  expirationDate: string;
}

/**
 * Plain `fetch()`, no SDK — the whole point of talking to confidential-indexer is
 * that consuming it never requires FHE-aware code. 403/202/200 are all meaningful
 * responses here (no delegation / delegated-but-not-decrypted-yet / real data),
 * not error states, so this returns the status alongside the body rather than
 * throwing on non-2xx.
 */
export async function fetchIndexer<T>(path: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${INDEXER_URL}${path}`);
  const body = (await response.json().catch(() => undefined)) as T;
  return { status: response.status, body };
}
