import { AsyncLocalStorage } from "node:async_hooks";
import type { GenericStorage } from "./token.types";

/**
 * {@link GenericStorage} backed by Node.js {@link AsyncLocalStorage}.
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
export class AsyncLocalMapStorage implements GenericStorage {
  readonly #als = new AsyncLocalStorage<Map<string, unknown>>();

  /** Execute `fn` within an isolated storage context. */
  run<R>(fn: () => R | Promise<R>): R | Promise<R> {
    return this.#als.run(new Map(), fn);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.#als.getStore()?.get(key) as T) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.#als.getStore()?.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.#als.getStore()?.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const asyncLocalStorage = new AsyncLocalMapStorage();
