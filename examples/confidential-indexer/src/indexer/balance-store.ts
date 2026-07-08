import type { Address, Hex } from "viem";
import type { ClearValue } from "@zama-fhe/sdk";
import type { KeyValueStore } from "../storage/kv-store.js";
import { deserializeClearValue, serializeClearValue } from "../storage/clear-value-codec.js";

export interface BalanceSnapshot {
  delegator: Address;
  contractAddress: Address;
  /** The ciphertext handle, exposed on the public query API as `encryptedValue`. */
  encryptedValue: Hex;
  clearValue: ClearValue;
  decryptedAtBlock: bigint;
}

function key(delegator: Address, contractAddress: Address): string {
  return `${delegator.toLowerCase()}:${contractAddress.toLowerCase()}`;
}

function serialize(snapshot: BalanceSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    clearValue: serializeClearValue(snapshot.clearValue),
    decryptedAtBlock: snapshot.decryptedAtBlock.toString(),
  });
}

function deserialize(json: string): BalanceSnapshot {
  const raw = JSON.parse(json);
  return {
    ...raw,
    clearValue: deserializeClearValue(raw.clearValue),
    decryptedAtBlock: BigInt(raw.decryptedAtBlock),
  };
}

/**
 * Latest known decrypted balance per (delegator, contractAddress) — what
 * the query API serves. Persisted via the injected `KeyValueStore`.
 */
export class BalanceStore {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async upsert(snapshot: BalanceSnapshot): Promise<void> {
    await this.#store.set(key(snapshot.delegator, snapshot.contractAddress), serialize(snapshot));
  }

  async get(delegator: Address, contractAddress: Address): Promise<BalanceSnapshot | undefined> {
    const json = await this.#store.get(key(delegator, contractAddress));
    return json ? deserialize(json) : undefined;
  }
}
