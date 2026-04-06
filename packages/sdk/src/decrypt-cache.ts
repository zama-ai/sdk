import { getAddress, type Address } from "viem";
import type { ClearValueType, Handle } from "./relayer/relayer-sdk.types";
import type { GenericStorage } from "./types";

/**
 * Storage-backed cache for decrypted FHE plaintext values.
 *
 * Each entry is keyed by `(requester, contractAddress, handle)` so that
 * different signers cannot read each other's cached decryptions — this
 * mirrors the on-chain ACL where only the handle owner (or delegate) is
 * authorized to decrypt.
 *
 * Addresses are checksummed and handles lowercased, making lookups
 * case-insensitive.  A separate index (`zama:decrypt:keys`) tracks all
 * stored cache keys so {@link clearForRequester} and {@link clearAll} can
 * enumerate entries without a full storage scan. Index writes are
 * serialised through a micro-queue to prevent concurrent `set` calls
 * from losing entries.
 *
 * All public methods are **best-effort**: storage errors are caught and
 * swallowed — the cache never throws.
 *
 * Cache storage key format:
 * ```
 * zama:decrypt:{checksumAddress}:{checksumAddress}:{lowercaseHandle}
 * ```
 *
 * Lifecycle:
 * - Populated by {@link ZamaSDK.decrypt} after relayer calls.
 * - Cleared by {@link ZamaSDK.revoke} / {@link ZamaSDK.revokeSession} (per-requester).
 * - Cleared by signer lifecycle events (disconnect, account change, chain change).
 * - Survives page reloads when backed by persistent storage (e.g. IndexedDB).
 */
export class DecryptCache {
  readonly #storage: GenericStorage;
  readonly #decryptNamespace = "zama:decrypt";
  readonly #decryptKeysNamespace = `${this.#decryptNamespace}:keys`;
  /** Serialises concurrent writes to the keys index. */
  #indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(storage: GenericStorage) {
    this.#storage = storage;
  }

  /** Returns the cached clear value or `null` on a miss / error. */
  async get(
    requester: Address,
    contractAddress: Address,
    handle: Handle,
  ): Promise<ClearValueType | null> {
    try {
      const key = this.#buildStorageKey(requester, contractAddress, handle);
      return await this.#storage.get<ClearValueType>(key);
    } catch (error) {
      console.warn("[zama-sdk] DecryptCache.get failed:", error); // eslint-disable-line no-console
      return null;
    }
  }

  /** Stores `value` for the given `(requester, contractAddress, handle)` tuple. */
  async set(
    requester: Address,
    contractAddress: Address,
    handle: Handle,
    value: ClearValueType,
  ): Promise<void> {
    try {
      const key = this.#buildStorageKey(requester, contractAddress, handle);
      await this.#storage.set<ClearValueType>(key, value);
      // Track the key in the index (serialised to avoid concurrent overwrites)
      this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
        this.#addToIndex(key).catch((error) => {
          console.warn("[zama-sdk] DecryptCache index write failed:", error); // eslint-disable-line no-console
        }),
      );
      await this.#indexWriteQueue;
    } catch (error) {
      console.warn("[zama-sdk] DecryptCache.set failed:", error); // eslint-disable-line no-console
    }
  }

  /** Removes all cached entries for the given `requester`. */
  async clearForRequester(requester: Address): Promise<void> {
    // Serialise with the index write queue to avoid racing with concurrent set() calls
    this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
      this.#doClearForRequester(requester).catch((error) => {
        console.warn("[zama-sdk] DecryptCache.clearForRequester failed:", error); // eslint-disable-line no-console
      }),
    );
    await this.#indexWriteQueue;
  }

  async #doClearForRequester(requester: Address): Promise<void> {
    const checksumRequester = getAddress(requester);
    const prefix = `${this.#decryptNamespace}:${checksumRequester}:`;
    const keys = await this.#readIndex();
    const toRemove: string[] = [];
    const remaining: string[] = [];
    for (const k of keys) {
      if (k.startsWith(prefix)) {
        toRemove.push(k);
      } else {
        remaining.push(k);
      }
    }
    await Promise.all(toRemove.map((k) => this.#storage.delete(k).catch(() => {})));
    await this.#storage.set<string[]>(this.#decryptKeysNamespace, remaining);
  }

  /** Removes all cached entries. */
  async clearAll(): Promise<void> {
    // Serialise with the index write queue to avoid racing with concurrent set() calls
    this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
      this.#doClearAll().catch((error) => {
        console.warn("[zama-sdk] DecryptCache.clearAll failed:", error); // eslint-disable-line no-console
      }),
    );
    await this.#indexWriteQueue;
  }

  async #doClearAll(): Promise<void> {
    const keys = await this.#readIndex();
    await Promise.all(keys.map((k) => this.#storage.delete(k).catch(() => {})));
    await this.#storage.delete(this.#decryptKeysNamespace);
  }

  #buildStorageKey(requester: Address, contractAddress: Address, handle: Handle): string {
    return `${this.#decryptNamespace}:${getAddress(requester)}:${getAddress(contractAddress)}:${handle.toLowerCase()}`;
  }

  async #readIndex(): Promise<string[]> {
    return (await this.#storage.get<string[]>(this.#decryptKeysNamespace)) ?? [];
  }

  async #addToIndex(key: string): Promise<void> {
    const keys = await this.#readIndex();
    if (!keys.includes(key)) {
      keys.push(key);
      await this.#storage.set<string[]>(this.#decryptKeysNamespace, keys);
    }
  }
}
