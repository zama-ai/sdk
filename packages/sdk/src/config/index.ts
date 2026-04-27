export { web, cleartext } from "./transports";
export type {
  RelayerConfig,
  WebRelayerConfig,
  CleartextRelayerConfig,
  WebRelayerOptions,
} from "./transports";

export type { ZamaConfig, ZamaConfigBase, AtLeastOneChain } from "./types";
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";

export { resolveChainRelayers, resolveStorage } from "./resolve";
export type { ResolvedChainRelayer } from "./resolve";

export { buildZamaConfig } from "./build";
