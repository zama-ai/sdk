import { ConfigurationError } from "../errors";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import type { CleartextRelayerConfig } from "./types";

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
    createRelayer: (chain) => {
      if (!chain.executorAddress) {
        throw new ConfigurationError(
          `Cleartext relayer requires an executorAddress. ` +
            `Either use a chain preset that includes it (e.g. hardhat, hoodi) ` +
            `or set it on the chain definition.`,
        );
      }
      return new RelayerCleartext(chain);
    },
  };
}
