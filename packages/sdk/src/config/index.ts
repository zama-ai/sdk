export { web, cleartext } from "./transports";
export type {
  TransportConfig,
  WebTransportConfig,
  CleartextTransportConfig,
  WebRelayerOptions,
} from "./transports";

export type { ZamaConfig, ZamaConfigBase, AtLeastOneChain } from "./types";
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";

export { resolveChainTransports, resolveStorage } from "./resolve";
export type { ResolvedChainTransport } from "./resolve";

export { buildZamaConfig } from "./build";
