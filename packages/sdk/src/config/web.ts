import { z } from "zod/mini";
import { CDN_INTEGRITY, CDN_URL, RelayerWeb } from "../relayer/relayer-web";
import { parseConfiguration } from "../validation";
import { RelayerWorkerClient } from "../worker/worker.client";
import type { WebRelayerConfig, WebRelayerOptions } from "./types";

const WebRelayerOptionsSchema = z.object({
  threads: z.optional(z.int().check(z.positive())),
  fheArtifactCacheTTL: z.optional(z.int().check(z.nonnegative())),
});

/**
 * Browser relayer — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param options - Worker options (threads, security, logger, storage).
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web(),
 *   [mainnet.id]: web({ threads: 4 }),
 * }
 * ```
 */
export function web(options?: WebRelayerOptions): WebRelayerConfig {
  if (options !== undefined) {
    parseConfiguration(WebRelayerOptionsSchema, options);
  }
  return {
    type: "web",
    createWorker: (chains, logger) =>
      new RelayerWorkerClient({
        cdnUrl: CDN_URL,
        chains,
        csrfToken: options?.security?.getCsrfToken?.() ?? "",
        integrity: options?.security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
        logger,
        thread: options?.threads,
      }),
    createRelayer: (chain, worker, logger) => new RelayerWeb({ chain, worker, ...options, logger }),
  };
}
