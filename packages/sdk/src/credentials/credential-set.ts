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
   * @throws If the batch failed (e.g. the user rejected the EIP-712 prompt).
   */
  credentialFor(address: Address): T;

  /**
   * Return the credential batch that covers `address`, or `null` if the batch
   * failed (e.g. signing rejected). Use this in error-tolerant paths.
   */
  tryCredentialFor(address: Address): T | null;

  /** All successfully signed credential batches in this set, in creation order. */
  readonly batches: ReadonlyArray<T>;

  /**
   * Addresses whose batch failed (e.g. user rejected the wallet prompt).
   * The mapped error is the reason for failure.
   * Empty when all batches succeeded.
   */
  readonly failures: ReadonlyMap<Address, Error>;
}

/** @internal */
export class CredentialSetImpl<T extends StoredCredentials> implements CredentialSet<T> {
  readonly #index: Map<Address, T | Error>;
  readonly batches: ReadonlyArray<T>;
  readonly failures: ReadonlyMap<Address, Error>;

  constructor(results: ReadonlyArray<{ addresses: ReadonlyArray<Address>; result: T | Error }>) {
    const index = new Map<Address, T | Error>();
    const failures = new Map<Address, Error>();
    const successBatches: T[] = [];

    for (const { addresses, result } of results) {
      if (result instanceof Error) {
        for (const addr of addresses) {
          const normalized = getAddress(addr);
          index.set(normalized, result);
          failures.set(normalized, result);
        }
      } else {
        successBatches.push(result);
        for (const addr of addresses) {
          index.set(getAddress(addr), result);
        }
      }
    }

    this.#index = index;
    this.batches = Object.freeze(successBatches);
    this.failures = failures;
  }

  credentialFor(address: Address): T {
    const normalized = getAddress(address);
    const entry = this.#index.get(normalized);
    if (entry === undefined) {
      throw new Error(`[zama-sdk] No credential found for address ${address}`);
    }
    if (entry instanceof Error) {
      throw entry;
    }
    return entry;
  }

  tryCredentialFor(address: Address): T | null {
    const entry = this.#index.get(getAddress(address));
    if (entry === undefined || entry instanceof Error) {
      return null;
    }
    return entry;
  }
}
