import { getAddress, type Address } from "viem";
import type { ClearValueType, Handle } from "./relayer/relayer-sdk.types";
import type { GenericStorage } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAMESPACE = "zama:decrypt";
const KEYS_INDEX_KEY = `${NAMESPACE}:keys`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStorageKey(requester: Address, contractAddress: Address, handle: Handle): string {
  return `${NAMESPACE}:${getAddress(requester)}:${getAddress(contractAddress)}:${handle.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// DecryptCache
// ---------------------------------------------------------------------------

/**
 * A storage-backed cache for decrypted FHE values.
 *
 * Entries are keyed by `(requester, contractAddress, handle)` using
 * checksummed addresses and lowercase handles so lookups are
 * case-insensitive.
 *
 * A separate index at {@link KEYS_INDEX_KEY} tracks all stored cache keys
 * so that {@link clearForRequester} and {@link clearAll} can enumerate
 * entries without a full scan.  Index writes are serialised through a
 * micro-queue to prevent concurrent `set` calls from clobbering each other.
 *
 * All public methods are **best-effort**: storage errors are caught and
 * swallowed — the cache will never throw.
 */
export class DecryptCache {
  readonly #storage: GenericStorage;

  /** Serialises concurrent writes to the keys index. */
  #indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(storage: GenericStorage) {
    this.#storage = storage;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns the cached clear value or `null` on a miss / error. */
  async get(
    requester: Address,
    contractAddress: Address,
    handle: Handle,
  ): Promise<ClearValueType | null> {
    try {
      const key = buildStorageKey(requester, contractAddress, handle);
      return await this.#storage.get<ClearValueType>(key);
    } catch {
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
      const key = buildStorageKey(requester, contractAddress, handle);
      await this.#storage.set<ClearValueType>(key, value);
      // Track the key in the index (serialised to avoid concurrent overwrites)
      this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
        this.#addToIndex(key).catch(() => {}),
      );
      await this.#indexWriteQueue;
    } catch {
      // best-effort
    }
  }

  /** Removes all cached entries for the given `requester`. */
  async clearForRequester(requester: Address): Promise<void> {
    try {
      const checksumRequester = getAddress(requester);
      const prefix = `${NAMESPACE}:${checksumRequester}:`;
      const keys = await this.#readIndex();
      const toRemove = keys.filter((k) => k.startsWith(prefix));
      await Promise.all(toRemove.map((k) => this.#storage.delete(k).catch(() => {})));
      const remaining = keys.filter((k) => !k.startsWith(prefix));
      await this.#storage.set<string[]>(KEYS_INDEX_KEY, remaining);
    } catch {
      // best-effort
    }
  }

  /** Removes all cached entries. */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.#readIndex();
      await Promise.all(keys.map((k) => this.#storage.delete(k).catch(() => {})));
      await this.#storage.delete(KEYS_INDEX_KEY);
    } catch {
      // best-effort
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  async #readIndex(): Promise<string[]> {
    const stored = await this.#storage.get<string[]>(KEYS_INDEX_KEY);
    return stored ?? [];
  }

  async #addToIndex(key: string): Promise<void> {
    const keys = await this.#readIndex();
    if (!keys.includes(key)) {
      keys.push(key);
      await this.#storage.set<string[]>(KEYS_INDEX_KEY, keys);
    }
  }
}
