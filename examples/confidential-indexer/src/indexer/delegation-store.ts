import type { Address } from "viem";
import type { DelegationRecord } from "../acl/types.js";
import type { KeyValueStore } from "../storage/kv-store.js";

function key(delegator: Address, contractAddress: Address): string {
  return `${delegator.toLowerCase()}:${contractAddress.toLowerCase()}`;
}

interface SerializedRecord extends Omit<DelegationRecord, "expirationDate" | "blockNumber"> {
  expirationDate: string;
  blockNumber: string;
}

function serialize(record: DelegationRecord): string {
  const serialized: SerializedRecord = {
    ...record,
    expirationDate: record.expirationDate.toString(),
    blockNumber: record.blockNumber.toString(),
  };
  return JSON.stringify(serialized);
}

function deserialize(json: string): DelegationRecord {
  const raw = JSON.parse(json) as SerializedRecord;
  return {
    ...raw,
    expirationDate: BigInt(raw.expirationDate),
    blockNumber: BigInt(raw.blockNumber),
  };
}

/**
 * View of which (delegator, contractAddress) pairs currently delegate to
 * this service, built from `delegation-log.ts` events. Persisted via the
 * injected `KeyValueStore` — in-memory by default, Redis-backed if
 * `--redisUrl` is configured (see `cli.ts`).
 *
 * Deliberately keys active/revoked state off which event type (`granted` /
 * `revoked`) was seen most recently for a pair — not off the numeric
 * expiration field in the log data, whose exact semantics weren't fully
 * verified against source (see `acl/delegation-log.ts`). This is a local
 * cache hint only: actual authorization is enforced protocol-side by
 * `sdk.decryption.delegatedDecryptValues()` itself (relayer/KMS-checked ACL
 * state), not by a client-side check in this store.
 */
export class DelegationStore {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async apply(records: readonly DelegationRecord[]): Promise<void> {
    for (const record of records) {
      const k = key(record.delegator, record.contractAddress);
      const existingJson = await this.#store.get(k);
      const existing = existingJson ? deserialize(existingJson) : undefined;
      if (existing && isNewerOrEqual(existing, record)) continue;
      await this.#store.set(k, serialize(record));
    }
  }

  async isKnownActive(delegator: Address, contractAddress: Address): Promise<boolean> {
    const json = await this.#store.get(key(delegator, contractAddress));
    return json !== undefined && deserialize(json).action === "granted";
  }

  async list(): Promise<DelegationRecord[]> {
    const all = await this.#store.getAll();
    return Object.values(all)
      .map(deserialize)
      .filter((entry) => entry.action === "granted");
  }
}

function isNewerOrEqual(existing: DelegationRecord, incoming: DelegationRecord): boolean {
  if (existing.blockNumber !== incoming.blockNumber) {
    return existing.blockNumber > incoming.blockNumber;
  }
  return existing.logIndex >= incoming.logIndex;
}
