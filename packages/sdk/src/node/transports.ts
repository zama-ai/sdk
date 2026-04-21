import type { NodeRelayerOptions, NodeTransportConfig } from "../config/transports";
import { RelayerNode } from "../relayer/relayer-node";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import { assertCondition } from "../utils/assertions";

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * **Note:** This factory is a placeholder for the type. Import `node` from
 * `@zama-fhe/sdk/node` instead — it provides the actual implementation with
 * the RelayerNode class.
 *
 * @param chain - Per-chain FHE instance overrides.
 * @param relayer - Shared relayer-pool options (e.g. `poolSize`, `logger`).
 *
 * @example
 * ```ts
 * import { node } from "@zama-fhe/sdk/node";
 * transports: { [sepolia.id]: node({ relayerUrl: "..." }, { poolSize: 4 }) }
 * ```
 */
export function node(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: NodeRelayerOptions,
): NodeTransportConfig {
  return {
    type: "node",
    chain,
    relayer,
    createRelayer: (resolvedChain, transport) => {
      assertCondition(transport.type === "node", "Transport config must be of type `node`");
      return new RelayerNode({
        chain: { ...resolvedChain, ...transport.chain },
        ...transport.relayer,
      });
    },
  };
}
