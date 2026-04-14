import type { Address } from "viem";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";
import type { Handle } from "../relayer/relayer-sdk.types";

/**
 * Group handles by contract address for per-contract relayer calls.
 */
export function runGroupByContractPipeline(handles: DecryptHandleEntry[]): Map<Address, Handle[]> {
  const byContract = new Map<Address, Handle[]>();
  for (const h of handles) {
    const existing = byContract.get(h.contractAddress);
    if (existing) {
      existing.push(h.handle);
    } else {
      byContract.set(h.contractAddress, [h.handle]);
    }
  }
  return byContract;
}
