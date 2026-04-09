import { getAddress, type Address } from "viem";
import type { StoredCredentials } from "../types";

/**
 * A set of FHE credentials covering an arbitrary number of contract addresses.
 *
 * When the SDK creates credentials for more than {@link MAX_CONTRACTS_PER_CREDENTIAL}
 * addresses, it transparently splits them into batches — one EIP-712 wallet
 * signature per batch. Callers use {@link credentialFor} to route each address
 * to the right batch without knowing about the split.
 *
 * @typeParam T - The concrete credential shape (`StoredCredentials` for regular,
 *   `DelegatedStoredCredentials` for delegated flows).
 */
export interface CredentialSet<T extends StoredCredentials = StoredCredentials> {
  /**
   * Return the credential batch that covers `address`.
   * @throws If `address` was not passed to `allow()`.
   */
  credentialFor(address: Address): T;

  /**
   * Return the credential batch that covers `address`, or `null` if the address
   * was not passed to `allow()`. Use this in error-tolerant paths.
   */
  tryCredentialFor(address: Address): T | null;

  /** All credential batches in this set, in creation order. */
  readonly batches: ReadonlyArray<T>;
}

/** @internal */
export class CredentialSetImpl<T extends StoredCredentials> implements CredentialSet<T> {
  readonly #index: Map<Address, T>;
  readonly batches: ReadonlyArray<T>;

  constructor(results: ReadonlyArray<{ addresses: ReadonlyArray<Address>; result: T }>) {
    const index = new Map<Address, T>();
    const allBatches: T[] = [];

    for (const { addresses, result } of results) {
      allBatches.push(result);
      for (const addr of addresses) {
        index.set(getAddress(addr), result);
      }
    }

    this.#index = index;
    this.batches = Object.freeze(allBatches);
  }

  credentialFor(address: Address): T {
    const entry = this.#index.get(getAddress(address));
    if (entry === undefined) {
      throw new Error(`[zama-sdk] No credential found for address ${address}`);
    }
    return entry;
  }

  tryCredentialFor(address: Address): T | null {
    return this.#index.get(getAddress(address)) ?? null;
  }
}
