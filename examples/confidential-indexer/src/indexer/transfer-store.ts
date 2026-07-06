import type { Address, Hex } from "viem";
import type { ClearValue } from "@zama-fhe/sdk";
import type { KeyValueStore } from "../storage/kv-store.js";
import { deserializeClearValue, serializeClearValue } from "../storage/clear-value-codec.js";

export interface DecryptedTransfer {
  contractAddress: Address;
  from: Address;
  to: Address;
  amountHandle: Hex;
  clearAmount: ClearValue;
  blockNumber: bigint;
  transactionHash: Hex;
}

function key(contractAddress: Address, transactionHash: Hex, amountHandle: Hex): string {
  return `${contractAddress.toLowerCase()}:${transactionHash}:${amountHandle}`;
}

function serialize(transfer: DecryptedTransfer): string {
  return JSON.stringify({
    ...transfer,
    clearAmount: serializeClearValue(transfer.clearAmount),
    blockNumber: transfer.blockNumber.toString(),
  });
}

function deserialize(json: string): DecryptedTransfer {
  const raw = JSON.parse(json);
  return {
    ...raw,
    clearAmount: deserializeClearValue(raw.clearAmount),
    blockNumber: BigInt(raw.blockNumber),
  };
}

/**
 * Cache of decrypted confidential transfers, queryable per (token, account).
 * Persisted via the injected `KeyValueStore`.
 */
export class TransferStore {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async upsert(transfer: DecryptedTransfer): Promise<void> {
    await this.#store.set(
      key(transfer.contractAddress, transfer.transactionHash, transfer.amountHandle),
      serialize(transfer),
    );
  }

  async listFor(contractAddress: Address, account: Address): Promise<DecryptedTransfer[]> {
    const normalized = account.toLowerCase();
    const all = await this.#store.getAll();
    return Object.values(all)
      .map(deserialize)
      .filter(
        (t) =>
          t.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
          (t.from.toLowerCase() === normalized || t.to.toLowerCase() === normalized),
      )
      .sort((a, b) => Number(a.blockNumber - b.blockNumber));
  }
}
