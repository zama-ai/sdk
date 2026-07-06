import type { Address, Hex } from "viem";

/** One (delegator, contractAddress) → delegate grant, as seen on-chain. */
export interface DelegationRecord {
  delegator: Address;
  delegate: Address;
  contractAddress: Address;
  /**
   * Expiration recorded in the log (unix seconds; `2^64-1` observed for
   * "permanent" grants). Informational only — see `delegation-store.ts` for
   * why this isn't what determines active/revoked state.
   */
  expirationDate: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  action: "granted" | "revoked";
}
