export { web, node, cleartext, custom } from "./transports";
export type {
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  CustomTransportConfig,
  TransportConfig,
} from "./transports";

export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
  ZamaConfigCustomRelayer,
  CreateZamaConfigBaseParams,
} from "./types";

export { resolveChainTransports, buildRelayer, resolveStorage } from "./resolve";
export type { ConfigWithTransports } from "./resolve";

import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import type { ConfigWithTransports } from "./resolve";
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

  if ("relayer" in params && params.relayer) {
    return {
      relayer: params.relayer,
      signer: params.signer,
      storage,
      sessionStorage,
      keypairTTL: params.keypairTTL,
      sessionTTL: params.sessionTTL,
      registryAddresses: params.registryAddresses,
      registryTTL: params.registryTTL,
      onEvent: params.onEvent,
    };
  }

  const p: ConfigWithTransports = params;
  const signer = resolveSigner(p);
  const chainTransports = resolveChainTransports(
    p.chains,
    p.transports,
    p.chains.map((c) => c.chainId),
  );
  const relayer = buildRelayer(chainTransports, () => signer.getChainId());

  return {
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: p.keypairTTL,
    sessionTTL: p.sessionTTL,
    registryAddresses: p.registryAddresses,
    registryTTL: p.registryTTL,
    onEvent: p.onEvent,
  };
}
