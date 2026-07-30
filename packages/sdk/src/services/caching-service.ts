import { getAddress, type Address } from "viem";
import { z } from "zod/mini";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import { checksummedAddress } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";

const CacheValueSchema = z.union([z.bigint(), z.boolean(), checksummedAddress]);
const CacheIndexSchema = z.array(z.string());

/**
 * Storage-backed cache for decrypted FHE plaintext values.
 *
 * Each entry is keyed by `(requester, contractAddress, handle)` so different
 * signers cannot read each other's cached decryptions.
 *
 * @internal
 */
export class CachingService {
  readonly #storage: GenericStorage;
  readonly #logger: GenericLogger;
  readonly #decryptNamespace = "zama:decrypt";
  readonly #decryptKeysNamespace = `${this.#decryptNamespace}:keys`;
  #indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(storage: GenericStorage, logger: GenericLogger) {
    this.#storage = storage;
    this.#logger = logger;
  }

  async get(
    requester: Address,
    contractAddress: Address,
    encryptedValue: EncryptedValue,
  ): Promise<ClearValue | null> {
    try {
      const key = this.#buildStorageKey(requester, contractAddress, encryptedValue);
      const value = await this.#storage.get(key);
      if (value === null) {
        return null;
      }
      const parsed = CacheValueSchema.safeParse(value);
      if (!parsed.success) {
        await this.delete(requester, contractAddress, encryptedValue);
        return null;
      }
      return parsed.data;
    } catch (error) {
      this.#logger.warn("CachingService.get failed", { error });
      return null;
    }
  }

  async set(
    requester: Address,
    contractAddress: Address,
    encryptedValue: EncryptedValue,
    value: ClearValue,
  ): Promise<void> {
    try {
      const key = this.#buildStorageKey(requester, contractAddress, encryptedValue);
      await this.#storage.set<ClearValue>(key, value);
      this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
        this.#addToIndex(key).catch((error) => {
          this.#logger.warn("CachingService index write failed", { error });
        }),
      );
      await this.#indexWriteQueue;
    } catch (error) {
      this.#logger.warn("CachingService.set failed", { error });
    }
  }

  async delete(
    requester: Address,
    contractAddress: Address,
    encryptedValue: EncryptedValue,
  ): Promise<void> {
    const key = this.#buildStorageKey(requester, contractAddress, encryptedValue);
    this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
      this.#doDelete(key).catch((error) => {
        this.#logger.warn("CachingService.delete failed", { error });
      }),
    );
    await this.#indexWriteQueue;
  }

  async clearForRequester(requester: Address): Promise<void> {
    this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
      this.#doClearForRequester(requester).catch((error) => {
        this.#logger.warn("CachingService.clearForRequester failed", { error });
      }),
    );
    await this.#indexWriteQueue;
  }

  async clearAll(): Promise<void> {
    this.#indexWriteQueue = this.#indexWriteQueue.then(() =>
      this.#doClearAll().catch((error) => {
        this.#logger.warn("CachingService.clearAll failed", { error });
      }),
    );
    await this.#indexWriteQueue;
  }

  async #doDelete(key: string): Promise<void> {
    await this.#storage.delete(key).catch(() => {});
    const keys = await this.#readIndex();
    const remaining = keys.filter((k) => k !== key);
    if (remaining.length !== keys.length) {
      await this.#storage.set(this.#decryptKeysNamespace, remaining);
    }
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
    await this.#storage.set(this.#decryptKeysNamespace, remaining);
  }

  async #doClearAll(): Promise<void> {
    const keys = await this.#readIndex();
    await Promise.all(keys.map((k) => this.#storage.delete(k).catch(() => {})));
    await this.#storage.delete(this.#decryptKeysNamespace);
  }

  #buildStorageKey(
    requester: Address,
    contractAddress: Address,
    encryptedValue: EncryptedValue,
  ): string {
    return `${this.#decryptNamespace}:${getAddress(requester)}:${getAddress(contractAddress)}:${encryptedValue.toLowerCase()}`;
  }

  async #readIndex(): Promise<string[]> {
    const value = await this.#storage.get(this.#decryptKeysNamespace);
    if (value === null) {
      return [];
    }
    const parsed = CacheIndexSchema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }
    await this.#storage.delete(this.#decryptKeysNamespace).catch(() => {});
    return [];
  }

  async #addToIndex(key: string): Promise<void> {
    const keys = await this.#readIndex();
    if (!keys.includes(key)) {
      keys.push(key);
      await this.#storage.set(this.#decryptKeysNamespace, keys);
    }
  }
}
