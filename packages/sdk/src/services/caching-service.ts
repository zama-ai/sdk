import { getAddress, toBytes, toHex, type Address } from "viem";
import { z } from "zod/mini";
import { deriveCacheTagKey, type DerivationSecretHolder } from "../credentials/keypair-wrapping";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import { checksummedAddress, hex } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";

const CacheValueSchema = z.union([z.bigint(), z.boolean(), checksummedAddress]);
const TaggedCacheEntrySchema = z.object({ value: CacheValueSchema, tag: hex });
const CacheIndexSchema = z.array(z.string());

type CacheValue = z.infer<typeof CacheValueSchema>;
type CacheEntry = CacheValue | z.infer<typeof TaggedCacheEntrySchema>;

/** Converts a value to and from its stored entry; `decode` returns `null` for an entry to discard. */
interface CacheEntryCodec {
  encode(key: string, value: CacheValue): Promise<CacheEntry>;
  decode(key: string, stored: unknown): Promise<CacheValue | null>;
}

const plainCodec: CacheEntryCodec = {
  encode: async (_key, value) => value,
  decode: async (_key, stored) => CacheValueSchema.safeParse(stored).data ?? null,
};

/** Binds the tag to the storage key, so a tagged value can't be moved to another handle. */
function tagInput(key: string, value: CacheValue): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([key, typeof value, String(value)]));
}

function taggedCodec(derivationSecret: DerivationSecretHolder): CacheEntryCodec {
  let tagKey: Promise<CryptoKey> | undefined;
  const getTagKey = () => (tagKey ??= deriveCacheTagKey(derivationSecret));
  return {
    async encode(key, value) {
      const tag = await crypto.subtle.sign("HMAC", await getTagKey(), tagInput(key, value));
      return { value, tag: toHex(new Uint8Array(tag)) };
    },
    async decode(key, stored) {
      const parsed = TaggedCacheEntrySchema.safeParse(stored);
      if (!parsed.success) {
        return null;
      }
      const { value, tag } = parsed.data;
      const verified = await crypto.subtle.verify(
        "HMAC",
        await getTagKey(),
        new Uint8Array(toBytes(tag)),
        tagInput(key, value),
      );
      return verified ? value : null;
    },
  };
}

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
  readonly #codec: CacheEntryCodec;
  #indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    storage: GenericStorage,
    logger: GenericLogger,
    derivationSecret?: DerivationSecretHolder,
  ) {
    this.#storage = storage;
    this.#logger = logger;
    this.#codec = derivationSecret ? taggedCodec(derivationSecret) : plainCodec;
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
      const value = await this.#codec.decode(key, stored);
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
      await this.#storage.set(key, await this.#codec.encode(key, CacheValueSchema.parse(value)));
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
