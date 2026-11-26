import { getAddress, toBytes, toHex, type Address } from "viem";
import { z } from "zod/mini";
import type { DerivationSecretHolder } from "../credentials/keypair-wrapping";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import { checksummedAddress, hex } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";

const CacheValueSchema = z.union([z.bigint(), z.boolean(), checksummedAddress]);
const TaggedCacheValueSchema = z.object({ value: CacheValueSchema, tag: hex });
/** Versioned so a future tag scheme never reuses this one's derived key. */
const TAG_KEY_INFO = "zama-sdk-decrypt-cache-tag-v1";

/** The bytes a tag covers: the entry's storage key and its value, so a tag is not valid for another entry. */
function tagInput(key: string, value: ClearValue): Uint8Array<ArrayBuffer> {
  // Lowercased because an address is tagged in the caller's casing on write but read back
  // checksummed; without it a non-checksummed address never verifies.
  return new TextEncoder().encode(JSON.stringify([key, typeof value, String(value).toLowerCase()]));
}
const CacheIndexSchema = z.array(z.string());

/**
 * Storage-backed cache for decrypted FHE plaintext values.
 *
 * Each entry is keyed by `(requester, contractAddress, handle)` so different
 * signers cannot read each other's cached decryptions.
 *
 * With a derivation secret, each entry is stored with a tag derived from that
 * secret, and an entry whose tag does not verify is a miss.
 *
 * @internal
 */
export class CachingService {
  readonly #storage: GenericStorage;
  readonly #logger: GenericLogger;
  readonly #decryptNamespace = "zama:decrypt";
  readonly #decryptKeysNamespace = `${this.#decryptNamespace}:keys`;
  readonly #derivationSecret: DerivationSecretHolder | undefined;
  #tagKey: Promise<CryptoKey> | undefined;
  #indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    storage: GenericStorage,
    logger: GenericLogger,
    derivationSecret?: DerivationSecretHolder,
  ) {
    this.#storage = storage;
    this.#logger = logger;
    this.#derivationSecret = derivationSecret;
  }

  async get(
    requester: Address,
    contractAddress: Address,
    encryptedValue: EncryptedValue,
  ): Promise<ClearValue | null> {
    try {
      const key = this.#buildStorageKey(requester, contractAddress, encryptedValue);
      const stored = await this.#storage.get(key);
      if (stored === null) {
        return null;
      }
      const value = await this.#readEntry(key, stored);
      if (value === null) {
        await this.delete(requester, contractAddress, encryptedValue);
      }
      return value;
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
      await this.#storage.set(key, await this.#toEntry(key, value));
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

  /** The value of a stored entry, or `null` when the entry is malformed or its tag does not verify. */
  async #readEntry(key: string, stored: unknown): Promise<ClearValue | null> {
    if (!this.#derivationSecret) {
      const parsed = CacheValueSchema.safeParse(stored);
      return parsed.success ? parsed.data : null;
    }
    const parsed = TaggedCacheValueSchema.safeParse(stored);
    if (!parsed.success) {
      return null;
    }
    const { value, tag } = parsed.data;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await this.#getTagKey(this.#derivationSecret),
      new Uint8Array(toBytes(tag)),
      tagInput(key, value),
    );
    return verified ? value : null;
  }

  async #toEntry(key: string, value: ClearValue): Promise<unknown> {
    if (!this.#derivationSecret) {
      return value;
    }
    const tag = await crypto.subtle.sign(
      "HMAC",
      await this.#getTagKey(this.#derivationSecret),
      tagInput(key, value),
    );
    return { value, tag: toHex(new Uint8Array(tag)) };
  }

  #getTagKey(derivationSecret: DerivationSecretHolder): Promise<CryptoKey> {
    this.#tagKey ??= derivationSecret
      .baseKey()
      .then((baseKey) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(),
            info: new TextEncoder().encode(TAG_KEY_INFO),
          },
          baseKey,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        ),
      );
    return this.#tagKey;
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
