export { web, node, cleartext } from "./transports";
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

export {
  resolveChainTransports,
  buildRelayer,
  resolveStorage,
  registerTransportHandler,
} from "./resolve";
export type { ConfigWithTransports } from "./resolve";

import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import { resolveStorage, resolveSigner, resolveChainTransports, buildRelayer } from "./resolve";

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   signer,
 *   transports: { [sepolia.id]: web({ relayerUrl: "https://relayer.testnet.zama.org/v2" }) },
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigBaseParams): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const signer = resolveSigner(params);
  const chainTransports = resolveChainTransports(
    params.chains,
    params.transports,
    params.chains.map((c) => c.id),
  );
  const relayer = buildRelayer(chainTransports, () => signer.getChainId());

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
