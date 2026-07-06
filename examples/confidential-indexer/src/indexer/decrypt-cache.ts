import type { Address, Hex } from "viem";
import { DelegationNotPropagatedError, type ClearValue, type ZamaSDK } from "@zama-fhe/sdk";
import type { Logger } from "../logging/logger.js";
import type { KeyValueStore } from "../storage/kv-store.js";
import { deserializeClearValue, serializeClearValue } from "../storage/clear-value-codec.js";

export interface CachedValue {
  clearValue: ClearValue;
  decryptedAtBlock: bigint;
}

function serialize(value: CachedValue): string {
  return JSON.stringify({
    clearValue: serializeClearValue(value.clearValue),
    decryptedAtBlock: value.decryptedAtBlock.toString(),
  });
}

function deserialize(json: string): CachedValue {
  const raw = JSON.parse(json);
  return {
    clearValue: deserializeClearValue(raw.clearValue),
    decryptedAtBlock: BigInt(raw.decryptedAtBlock),
  };
}

/**
 * Decrypt-once-cache-forever(-ish) layer over
 * `sdk.decryption.delegatedDecryptValues()`. A ciphertext handle's cleared
 * value never changes (a new transfer produces a *new* handle, never
 * mutates an old one) — so caching by handle, not by account, is always
 * safe to keep indefinitely; no TTL/invalidation needed here. Persisted via
 * the injected `KeyValueStore` — a Redis-backed store means a restart
 * doesn't re-pay the KMS round-trip for handles already decrypted before.
 *
 * Retries on `DelegationNotPropagatedError` the same way
 * `examples/node-viem`'s `decryptBalanceAs` does: a freshly granted ACL
 * delegation takes ~1-2 minutes to propagate to the gateway on Sepolia.
 */
export class DecryptCache {
  readonly #store: KeyValueStore;
  readonly #sdk: ZamaSDK;
  readonly #logger: Logger;
  readonly #maxRetries: number;
  readonly #retryDelayMs: number;

  constructor(params: {
    store: KeyValueStore;
    sdk: ZamaSDK;
    logger: Logger;
    maxRetries?: number;
    retryDelayMs?: number;
  }) {
    this.#store = params.store;
    this.#sdk = params.sdk;
    this.#logger = params.logger;
    this.#maxRetries = params.maxRetries ?? 5;
    this.#retryDelayMs = params.retryDelayMs ?? 30_000;
  }

  async get(handle: Hex): Promise<CachedValue | undefined> {
    const json = await this.#store.get(handle);
    return json ? deserialize(json) : undefined;
  }

  /**
   * Resolves `handle` to its cleartext value on behalf of `delegatorAddress`.
   * Callers must have already confirmed the delegation is active (see
   * `DelegationStore.isKnownActive` + a live `sdk.delegations.isActive()`
   * check) — this method does not check authorization itself, it only
   * decrypts and caches.
   */
  async resolve(params: {
    handle: Hex;
    contractAddress: Address;
    delegatorAddress: Address;
    atBlock: bigint;
  }): Promise<CachedValue> {
    const cachedJson = await this.#store.get(params.handle);
    if (cachedJson) return deserialize(cachedJson);

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
      try {
        const values = await this.#sdk.decryption.delegatedDecryptValues(
          [{ encryptedValue: params.handle, contractAddress: params.contractAddress }],
          params.delegatorAddress,
        );
        const resolved: CachedValue = {
          clearValue: values[params.handle],
          decryptedAtBlock: params.atBlock,
        };
        await this.#store.set(params.handle, serialize(resolved));
        return resolved;
      } catch (error) {
        lastError = error;
        if (error instanceof DelegationNotPropagatedError && attempt < this.#maxRetries) {
          this.#logger.warn(
            `ACL grant not yet propagated for ${params.delegatorAddress} on ` +
              `${params.contractAddress} (attempt ${attempt}/${this.#maxRetries}), retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, this.#retryDelayMs));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}
