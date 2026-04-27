import type { FheChain, RelayerChainConfig } from "./types";

/** Convert an `FheChain` (with `id`) to a `RelayerChainConfig` (with `chainId`) for the relayer layer. */
export function toRelayerChainConfig({ id, ...rest }: FheChain): RelayerChainConfig {
  return { ...rest, chainId: id };
}
