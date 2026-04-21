export { web, cleartext } from "./transports";
export type {
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  TransportConfig,
} from "./transports";

export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
  CreateZamaConfigBaseParams,
} from "./types";

export { resolveChainTransports, buildRelayer, resolveStorage } from "./resolve";
export { registerRelayer as registerTransportHandler } from "./relayers";
export type { ConfigWithTransports } from "./resolve";

export { buildZamaConfig } from "./build";
