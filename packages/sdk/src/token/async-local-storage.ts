import { AsyncLocalStorage } from "node:async_hooks";
import type { GenericStringStorage } from "./token.types";

/**
 * {@link GenericStringStorage} backed by Node.js {@link AsyncLocalStorage}.
 *
 * Each async context (e.g. HTTP request) gets its own isolated `Map`,
 * so credentials from one request never leak into another.
 *
 * Call {@link run} to establish a context before using the SDK:
 *
 * ```ts
 * import { asyncLocalStorage } from "@zama-fhe/sdk/node";
 *
 * app.post("/api/transfer", (req, res) => {
 *   asyncLocalStorage.run(async () => {
 *     const sdk = new ZamaSDK({ relayer, signer, storage: asyncLocalStorage });
 *     // credentials are scoped to this request
 *   });
 * });
 * ```
 */
class AsyncLocalMapStorage implements GenericStringStorage {
  readonly #als = new AsyncLocalStorage<Map<string, string>>();

  /** Execute `fn` within an isolated storage context. */
  run<T>(fn: () => T | Promise<T>): T | Promise<T> {
    return this.#als.run(new Map(), fn);
  }

  async getItem(key: string): Promise<string | null> {
    return this.#als.getStore()?.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.#als.getStore()?.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.#als.getStore()?.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const asyncLocalStorage = new AsyncLocalMapStorage();
