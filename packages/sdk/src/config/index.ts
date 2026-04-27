export { web } from "./web";
export { cleartext } from "./cleartext";

export type {
  ZamaConfig,
  ZamaConfigBase,
  AtLeastOneChain,
  RelayerConfig,
  WebRelayerConfig,
  CleartextRelayerConfig,
  WebRelayerOptions,
} from "./types";
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";

export { resolveChainRelayers, resolveStorage } from "./resolve";
export type { ResolvedChainRelayer } from "./resolve";

export { buildZamaConfig } from "./build";
