export { web, cleartext } from "./transports";
export type {
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  TransportConfig,
} from "./transports";

export type { ZamaConfig, ZamaConfigBase } from "./types";
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";

export { resolveChainTransports, resolveStorage } from "./resolve";
export type { ResolvedChainTransport } from "./resolve";
export { registerRelayer as registerTransportHandler } from "./relayers";

export { buildZamaConfig } from "./build";
