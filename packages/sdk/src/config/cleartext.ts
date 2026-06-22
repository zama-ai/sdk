import { ConfigurationError } from "../errors";
import { FhevmRelayer, type FhevmRuntimeConfig } from "../relayer/fhevm-relayer";
import type { CleartextRelayerConfig } from "./types";

/**
 * Cleartext relayer — drives the FHE backend in cleartext mode (no FHE infrastructure).
 *
 * When `executorAddress` is set on the chain definition (e.g. `hardhat`, `hoodi`),
 * it is picked up automatically.
 *
 * @param runtime - Global `@fhevm/sdk` runtime config (WASM load mode, threads,
 *   logger, auth). Applied once per process when the client first initializes.
 *   Per-chain `auth` from the chain definition is merged in by {@link FhevmRelayer}.
 *
 * @example
 * ```ts
 * // executorAddress comes from the chain preset:
 * relayers: { [hardhat.id]: cleartext() }
 * ```
 */
export function cleartext(runtime: FhevmRuntimeConfig = {}): CleartextRelayerConfig {
  return {
    type: "cleartext",
    createRelayer: (chain) => {
      if (!chain.executorAddress) {
        throw new ConfigurationError(
          `Cleartext relayer requires an executorAddress. ` +
            `Either use a chain preset that includes it (e.g. hardhat, hoodi) ` +
            `or set it on the chain definition.`,
        );
      }
      return new FhevmRelayer({ chain, runtime, cleartext: true });
    },
  };
}
