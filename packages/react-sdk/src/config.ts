import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import {
  createZamaConfig as createZamaConfigBase,
  resolveChainTransports,
  buildRelayer,
  resolveStorage,
  type GenericSigner,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigViem,
  type ZamaConfigEthers,
  type ZamaConfigCustomSigner,
} from "@zama-fhe/sdk";
import { WagmiSigner } from "./wagmi/wagmi-signer";

// Re-export base config types and helpers
export {
  web,
  node,
  cleartext,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigViem,
  type ZamaConfigEthers,
  type ZamaConfigCustomSigner,
  type TransportConfig,
  type WebTransportConfig,
  type NodeTransportConfig,
  type CleartextTransportConfig,
} from "@zama-fhe/sdk";

// ── Wagmi-specific config variant ────────────────────────────────────────────

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi extends ZamaConfigBase {
  wagmiConfig: Config;
  relayer?: never;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Union of all config variants (base + wagmi). */
export type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;

// ── Factory (widened for wagmi) ──────────────────────────────────────────────

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * Supports all base SDK paths plus the wagmi adapter:
 * - **wagmiConfig** — derives signer from wagmi, auto-resolves chain IDs
 * - **viem** — takes native viem clients
 * - **ethers** — takes native ethers types
 * - **signer** — raw GenericSigner
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   wagmiConfig,
 *   transports: { [sepolia.id]: web({ relayerUrl: "/api/relayer/11155111" }) },
 * });
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigParams): ZamaConfig {
  // Non-wagmi paths — delegate to sdk base factory
  if (!("wagmiConfig" in params) || !params.wagmiConfig) {
    return createZamaConfigBase(params as Exclude<CreateZamaConfigParams, ZamaConfigWagmi>);
  }

  // Wagmi path — resolve signer from wagmi config
  const signer: GenericSigner = new WagmiSigner({ config: params.wagmiConfig });
  const wagmiConfig = params.wagmiConfig;
  const getChainIdFn = () => Promise.resolve(getChainId(wagmiConfig));

  const chainIds = wagmiConfig.chains.map((c: { id: number }) => c.id);
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(params.chains, params.transports, chainIds);
  const relayer = buildRelayer(chainTransports, getChainIdFn);

  return {
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
