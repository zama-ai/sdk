import type { Address } from "viem";
import type { DelegationRecord } from "../acl/types.js";

function key(delegator: Address, contractAddress: Address): string {
  return `${delegator.toLowerCase()}:${contractAddress.toLowerCase()}`;
}

/**
 * In-memory view of which (delegator, contractAddress) pairs currently
 * delegate to this service, built from `delegation-log.ts` events.
 *
 * Deliberately keys active/revoked state off which event type (`granted` /
 * `revoked`) was seen most recently for a pair — not off the numeric
 * expiration field in the log data, whose exact semantics weren't fully
 * verified against source (see `acl/delegation-log.ts`). This is a local
 * cache hint only: `indexer/decrypt-cache.ts` re-verifies with
 * `sdk.delegations.isActive()` before ever actually decrypting anything.
 */
export class DelegationStore {
  readonly #entries = new Map<string, DelegationRecord>();

  apply(records: readonly DelegationRecord[]): void {
    for (const record of records) {
      const k = key(record.delegator, record.contractAddress);
      const existing = this.#entries.get(k);
      if (existing && isNewerOrEqual(existing, record)) continue;
      this.#entries.set(k, record);
    }
  }

  isKnownActive(delegator: Address, contractAddress: Address): boolean {
    return this.#entries.get(key(delegator, contractAddress))?.action === "granted";
  }

  list(): DelegationRecord[] {
    return [...this.#entries.values()].filter((entry) => entry.action === "granted");
  }
}

function isNewerOrEqual(existing: DelegationRecord, incoming: DelegationRecord): boolean {
  if (existing.blockNumber !== incoming.blockNumber) {
    return existing.blockNumber > incoming.blockNumber;
  }
  return existing.logIndex >= incoming.logIndex;
}
