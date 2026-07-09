import { ConfigurationError } from "../errors";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";
import type { CleartextRelayerConfig } from "./types";

/**
 * Cleartext relayer — drives the FHE backend in cleartext mode (no FHE infrastructure).
 *
 * When `executorAddress` is set on the chain definition (e.g. `hardhat`, `hoodi`),
 * it is picked up automatically.
 *
 * @example
 * ```ts
 * // executorAddress comes from the chain preset:
 * relayers: { [hardhat.id]: cleartext({ batchRpcCalls: true }) }
 * ```
 */
export function cleartext(options?: RelayerOptions): CleartextRelayerConfig {
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
      return new FhevmRelayer({ chain, options, cleartext: true });
    },
  };
}
