/**
 * Built-in chain presets for `@zama-fhe/sdk` — {@link mainnet}, {@link sepolia},
 * {@link hoodi} and the other bundled networks — plus {@link chains}, the same
 * presets keyed by chain ID.
 *
 * Each preset is a {@link FheChain}: the per-chain FHE contract addresses and
 * network settings the SDK needs.
 *
 * @packageDocumentation
 */

export {
  mainnet,
  polygon,
  sepolia,
  polygonAmoy,
  hoodi,
  zenithTrexTestnet,
  bscTestnet,
  hardhat,
  anvil,
  chains,
} from "./configs";
export type { FheChain, FheChainAuth, AtLeastOneChain } from "./types";
