import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import {
  createZamaConfig as createZamaConfigBase,
  resolveChainTransports,
  buildRelayer,
  type GenericSigner,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigViem,
  type ZamaConfigEthers,
  type ZamaConfigCustomSigner,
  type ZamaConfigCustomRelayer,
  type TransportConfig,
} from "@zama-fhe/sdk";
import { WagmiSigner } from "./wagmi/wagmi-signer";

// Re-export base config types and helpers
export {
  fhevm,
  cleartext,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigViem,
  type ZamaConfigEthers,
  type ZamaConfigCustomSigner,
  type ZamaConfigCustomRelayer,
  type TransportConfig,
  type FhevmTransport,
  type FhevmTransportOverrides,
  type CleartextTransport,
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
  | ZamaConfigCustomSigner
  | ZamaConfigCustomRelayer;

// ── Factory (widened for wagmi) ──────────────────────────────────────────────

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * Supports all base SDK paths plus the wagmi adapter:
 * - **wagmiConfig** — derives signer from wagmi, auto-resolves chain IDs
 * - **viem** — takes native viem clients
 * - **ethers** — takes native ethers types
 * - **signer** — raw GenericSigner
 * - **relayer** — pre-built RelayerSDK
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   wagmiConfig,
 *   transports: { [sepolia.id]: fhevm("/api/relayer/11155111") },
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
  const chainNameResolver = (id: number) =>
    (wagmiConfig.chains.find((c: { id: number }) => c.id === id) as { name: string } | undefined)
      ?.name ?? id;

  const chainTransports = resolveChainTransports(
    params.chains,
    params.transports,
    chainIds,
    chainNameResolver,
  );
  const relayer = buildRelayer(chainTransports, getChainIdFn);

  return {
    relayer,
    signer,
    storage: params.storage,
    sessionStorage: params.sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryAddresses: params.registryAddresses,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as ZamaConfig;
}
