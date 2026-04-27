import { CDN_INTEGRITY, CDN_URL, RelayerWeb } from "../relayer/relayer-web";
import { RelayerWorkerClient } from "../worker/worker.client";
import type { WebRelayerConfig, WebRelayerOptions } from "./types";

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
  return {
    type: "web",
    createWorker: (chains) =>
      new RelayerWorkerClient({
        cdnUrl: CDN_URL,
        chains,
        csrfToken: options?.security?.getCsrfToken?.() ?? "",
        integrity: options?.security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
        logger: options?.logger,
        thread: options?.threads,
      }),
    createRelayer: (chain, worker) => new RelayerWeb({ chain, worker, ...options }),
  };
}
