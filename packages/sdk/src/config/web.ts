import { z } from "zod/mini";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";
import { parseSchema } from "../validation";
import {
  DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
  type EncryptWorkerTimeouts,
} from "../worker/encrypt-worker-client";
import type { WebRelayerConfig } from "./types";

/** {@link RelayerOptions} plus the web-only encryption offload switches. */
export interface WebRelayerOptions extends RelayerOptions {
  /**
   * Run encryption in a dedicated Web Worker so ZK proof generation never
   * blocks the page's main thread.
   *
   * - `"auto"` (the default) offloads when the environment can spawn module
   *   workers, and falls back to the main thread when it can't (the worker
   *   script fails to load, times out, or crashes), warning on the console.
   * - `true` requires the offload: the same failures reject the encryption
   *   with `EncryptOffloadUnavailableError` instead of falling back.
   *   The rejection happens on the first encryption, not at config time, so
   *   server-side rendering is unaffected.
   * - `false` always encrypts on the calling thread.
   *
   * @defaultValue `"auto"`
   */
  readonly offloadEncrypt?: "auto" | boolean;
  /**
   * Watchdog deadlines for the encrypt worker's lifecycle steps, in
   * milliseconds. A missed deadline means the worker is presumed stuck: it
   * is discarded, and the operation falls back or rejects per the
   * `offloadEncrypt` setting. Individual encrypt operations are not watched; a
   * worker computing a ZK proof can run for as long as it needs.
   *
   * @defaultValue `{ spawn: 10_000, init: 300_000 }`
   */
  readonly offloadTimeouts?: Partial<EncryptWorkerTimeouts>;
  /**
   * Custom source for the encrypt worker, for bundlers or CSPs that the
   * built-in `new Worker(new URL("./encrypt.worker.js", import.meta.url))`
   * spawn doesn't reach: Vite dev-mode pre-bundling and older webpack don't
   * always detect that pattern inside `node_modules`, and a strict
   * `worker-src` CSP may only allow a path the app itself serves.
   *
   * - A string or `URL`: spawned as `new Worker(source, options)` with the
   *   SDK's own worker options. Same-origin rules apply, as for any worker
   *   URL. Serve `dist/esm/encrypt.worker.js` from this package, copied into
   *   your public/static directory.
   * - A factory `() => Worker`: called to obtain the worker; you own every
   *   construction option. Write the `new Worker(new URL(...))` expression
   *   in your own source so your bundler can detect and rewrite it natively.
   *
   * When absent, the SDK spawns its own bundled worker.
   *
   * @example
   * ```ts
   * web({ offloadWorker: "/encrypt.worker.js" })
   * web({ offloadWorker: () => new Worker(new URL("./workers/encrypt.js", import.meta.url), { type: "module" }) })
   * ```
   */
  readonly offloadWorker?: string | URL | (() => Worker);
}

const timeoutSchema = (fallback: number) => z._default(z.number().check(z.positive()), fallback);
const offloadWorkerFunction = z.custom<() => Worker>((v) => typeof v === "function");
const WebRelayerOptionsSchema = z.object({
  offloadEncrypt: z._default(z.union([z.literal("auto"), z.boolean()]), "auto"),
  // Per-field defaults, so an explicit `{ spawn: undefined }` cannot overwrite
  // a default downstream.
  offloadTimeouts: z.optional(
    z.object({
      spawn: timeoutSchema(DEFAULT_ENCRYPT_WORKER_TIMEOUTS.spawn),
      init: timeoutSchema(DEFAULT_ENCRYPT_WORKER_TIMEOUTS.init),
    }),
  ),
  // Non-empty: `new Worker("")` resolves to the document URL and fails as a
  // spawn error rather than as the configuration mistake it is.
  offloadWorker: z.optional(
    z.union([z.string().check(z.minLength(1)), z.instanceof(URL), offloadWorkerFunction]),
  ),
});

/**
 * Browser relayer, driving `@fhevm/sdk` via {@link FhevmRelayer} with
 * encryption offloaded to a Web Worker by default.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web({ timeout: 5 * 60_000 }),
 *   [mainnet.id]: web({ batchRpcCalls: true, offloadEncrypt: false }),
 * }
 * ```
 */
export function web(options?: WebRelayerOptions): WebRelayerConfig {
  const { offloadEncrypt, offloadTimeouts, offloadWorker, ...relayerOptions } = options ?? {};
  const parsed = parseSchema(WebRelayerOptionsSchema, {
    offloadEncrypt,
    offloadTimeouts,
    offloadWorker,
  });
  return {
    type: "web",
    createRelayer: (chain, logger) =>
      new FhevmRelayer({
        chain,
        options: relayerOptions,
        offloadEncrypt: parsed.offloadEncrypt,
        offloadTimeouts: parsed.offloadTimeouts,
        offloadWorker: parsed.offloadWorker,
        logger,
      }),
  };
}
