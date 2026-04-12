export { fhevm, cleartext } from "./transports";
export type { FhevmTransportConfig, CleartextTransport, TransportConfig } from "./transports";

export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
  ZamaConfigCustomRelayer,
  CreateZamaConfigBaseParams,
} from "./types";

export { resolveChainTransports, buildRelayer } from "./resolve";
export type { ConfigWithTransports } from "./resolve";

import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import type { ConfigWithTransports } from "./resolve";
import {
  resolveStorage,
  resolveSigner,
  resolveChainTransports,
  buildRelayer,
  buildConfig,
} from "./resolve";

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   signer,
 *   transports: { [sepolia.id]: fhevm({ relayerUrl: "https://relayer.testnet.zama.org/v2" }) },
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigBaseParams): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);

  if ("relayer" in params && params.relayer) {
    return buildConfig(params.relayer, params.signer, storage, sessionStorage, params);
  }

  const p = params as ConfigWithTransports;
  const signer = resolveSigner(p);
  const chainTransports = resolveChainTransports(
    p.chains,
    p.transports,
    p.chains.map((c) => c.chainId),
  );
  const relayer = buildRelayer(chainTransports, () => signer.getChainId());

  return buildConfig(relayer, signer, storage, sessionStorage, p);
}
