import type { Address, Hex } from "viem";
import type { ClearValue } from "@zama-fhe/sdk";

export interface BalanceSnapshot {
  delegator: Address;
  contractAddress: Address;
  handle: Hex;
  clearValue: ClearValue;
  decryptedAtBlock: bigint;
}

function key(delegator: Address, contractAddress: Address): string {
  return `${delegator.toLowerCase()}:${contractAddress.toLowerCase()}`;
}

/** Latest known decrypted balance per (delegator, contractAddress) — what the query API serves. */
export class BalanceStore {
  readonly #entries = new Map<string, BalanceSnapshot>();

  upsert(snapshot: BalanceSnapshot): void {
    this.#entries.set(key(snapshot.delegator, snapshot.contractAddress), snapshot);
  }

  get(delegator: Address, contractAddress: Address): BalanceSnapshot | undefined {
    return this.#entries.get(key(delegator, contractAddress));
  }
}
