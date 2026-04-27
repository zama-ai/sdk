import type { FheChain } from "../chains/types";
import { ConfigurationError } from "../errors";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { CDN_INTEGRITY, CDN_URL, RelayerWeb } from "../relayer/relayer-web";
import { RelayerWorkerClient } from "../worker/worker.client";
import type { CleartextRelayerConfig, WebRelayerConfig, WebRelayerOptions } from "./types";

// ── Relayer factories ───────────────────────────────────────────────────────

/**
 * Browser relayer — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param options - Worker options (threads, security, logger, storage).
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web(),
 *   [mainnet.id]: web(),
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

/**
 * Cleartext relayer — routes to RelayerCleartext (no FHE infrastructure).
 *
 * When `executorAddress` is set on the chain definition (e.g. `hardhat`, `hoodi`),
 * it is picked up automatically.
 *
 * @example
 * ```ts
 * // executorAddress comes from the chain preset:
 * relayers: { [hardhat.id]: cleartext() }
 * ```
 */
export function cleartext(): CleartextRelayerConfig {
  return {
    type: "cleartext",
    createRelayer: (resolvedChain) => {
      if (!resolvedChain.executorAddress) {
        throw new ConfigurationError(
          `Cleartext relayer requires an executorAddress. ` +
            `Either use a chain preset that includes it (e.g. hardhat, hoodi) ` +
            `or set it on the chain definition.`,
        );
      }
      return new RelayerCleartext(resolvedChain as FheChain);
    },
  };
}
