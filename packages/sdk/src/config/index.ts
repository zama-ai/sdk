export { cleartext } from "./cleartext";
export { createConfig } from "./create";

export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigGeneric,
  AtLeastOneChain,
  RelayerConfig,
  CleartextRelayerConfig,
} from "./types";
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";

export { resolveChainRelayers, resolveStorage } from "./resolve";
export type { ResolvedChainRelayer } from "./resolve";

export { buildZamaConfig } from "./build";
