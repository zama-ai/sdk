import type { GenericStringStorage } from "../token/token.types";

/** Cached shape for the FHE network public key. */
interface CachedPublicKey {
  publicKeyId: string;
  /** Base64-encoded Uint8Array. */
  publicKey: string;
}

/** Cached shape for FHE public params. */
interface CachedPublicParams {
  publicParamsId: string;
  /** Base64-encoded Uint8Array. */
  publicParams: string;
}

/** Return type of the public key fetcher. */
type PublicKeyResult = { publicKeyId: string; publicKey: Uint8Array } | null;

/** Return type of the public params fetcher. */
type PublicParamsResult = { publicParamsId: string; publicParams: Uint8Array } | null;

const CHUNK_SIZE = 8192;

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Persistent cache for FHE network public key and public params.
 * Uses a {@link GenericStringStorage} backend (IndexedDB, memory, etc.)
 * to avoid re-downloading large binary data on every app instantiation.
 *
 * Cache keys are scoped by chain ID.
 */
export class PublicParamsCache {
  readonly #storage: GenericStringStorage;
  readonly #chainId: number;
  #publicKeyMem: PublicKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<PublicKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();

  constructor(storage: GenericStringStorage, chainId: number) {
    this.#storage = storage;
    this.#chainId = chainId;
  }

  async getPublicKey(fetcher: () => Promise<PublicKeyResult>): Promise<PublicKeyResult> {
    // In-memory hit
    if (this.#publicKeyMem !== undefined) return this.#publicKeyMem;

    // Deduplicate concurrent calls
    if (this.#publicKeyInflight) return this.#publicKeyInflight;

    this.#publicKeyInflight = this.#loadPublicKey(fetcher);
    try {
      return await this.#publicKeyInflight;
    } finally {
      this.#publicKeyInflight = null;
    }
  }

  async #loadPublicKey(fetcher: () => Promise<PublicKeyResult>): Promise<PublicKeyResult> {
    const key = `fhe:pubkey:${this.#chainId}`;

    // Try persistent storage
    try {
      const stored = await this.#storage.getItem(key);
      if (stored) {
        const cached = JSON.parse(stored) as CachedPublicKey;
        const result: PublicKeyResult = {
          publicKeyId: cached.publicKeyId,
          publicKey: fromBase64(cached.publicKey),
        };
        this.#publicKeyMem = result;
        return result;
      }
    } catch {
      // Storage read failed — fall through to fetcher
    }

    // Fetch from relayer
    const result = await fetcher();
    if (result === null) return null;

    // Cache in memory
    this.#publicKeyMem = result;

    // Persist (best-effort)
    try {
      const cached: CachedPublicKey = {
        publicKeyId: result.publicKeyId,
        publicKey: toBase64(result.publicKey),
      };
      await this.#storage.setItem(key, JSON.stringify(cached));
    } catch {
      // Write failed — data still usable in memory
    }

    return result;
  }

  async getPublicParams(
    bits: number,
    fetcher: () => Promise<PublicParamsResult>,
  ): Promise<PublicParamsResult> {
    // In-memory hit
    const mem = this.#publicParamsMem.get(bits);
    if (mem !== undefined) return mem;

    // Deduplicate concurrent calls
    const inflight = this.#publicParamsInflight.get(bits);
    if (inflight) return inflight;

    const promise = this.#loadPublicParams(bits, fetcher);
    this.#publicParamsInflight.set(bits, promise);
    try {
      return await promise;
    } finally {
      this.#publicParamsInflight.delete(bits);
    }
  }

  async #loadPublicParams(
    bits: number,
    fetcher: () => Promise<PublicParamsResult>,
  ): Promise<PublicParamsResult> {
    const key = `fhe:params:${this.#chainId}:${bits}`;

    // Try persistent storage
    try {
      const stored = await this.#storage.getItem(key);
      if (stored) {
        const cached = JSON.parse(stored) as CachedPublicParams;
        const result: PublicParamsResult = {
          publicParamsId: cached.publicParamsId,
          publicParams: fromBase64(cached.publicParams),
        };
        this.#publicParamsMem.set(bits, result);
        return result;
      }
    } catch {
      // Storage read failed — fall through to fetcher
    }

    // Fetch from relayer
    const result = await fetcher();
    if (result === null) return null;

    // Cache in memory
    this.#publicParamsMem.set(bits, result);

    // Persist (best-effort)
    try {
      const cached: CachedPublicParams = {
        publicParamsId: result.publicParamsId,
        publicParams: toBase64(result.publicParams),
      };
      await this.#storage.setItem(key, JSON.stringify(cached));
    } catch {
      // Write failed — data still usable in memory
    }

    return result;
  }
}
