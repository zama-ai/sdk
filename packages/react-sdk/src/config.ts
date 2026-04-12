import type { PublicClient, WalletClient, EIP1193Provider } from "viem";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import type { Signer, Provider } from "ethers";
import {
  createZamaConfig as createZamaConfigBase,
  resolveChainTransports,
  buildRelayer,
  type GenericSigner,
  type ExtendedFhevmInstanceConfig,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigCustomSigner,
  type ZamaConfigCustomRelayer,
  type TransportConfig,
} from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { WagmiSigner } from "./wagmi/wagmi-signer";

// Re-export base config types and helpers
export {
  fhevm,
  cleartext,
  type ZamaConfig,
  type ZamaConfigBase,
  type ZamaConfigCustomSigner,
  type ZamaConfigCustomRelayer,
  type TransportConfig,
  type FhevmTransport,
  type FhevmTransportOverrides,
  type CleartextTransport,
} from "@zama-fhe/sdk";

// ── React-specific config variants ───────────────────────────────────────────

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi extends ZamaConfigBase {
  wagmiConfig: Config;
  relayer?: never;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Viem path — takes native viem clients. */
export interface ZamaConfigViem extends ZamaConfigBase {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    ethereum?: EIP1193Provider;
  };
  relayer?: never;
  wagmiConfig?: never;
  signer?: never;
  ethers?: never;
  transports: Record<number, TransportConfig>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, TransportConfig>;
}

/** Union of all config variants (base + React-specific adapters). */
export type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner
  | ZamaConfigCustomRelayer;

// ── Signer resolution (React-specific) ──────────────────────────────────────

type CreateZamaConfigWithTransports =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;

function resolveSigner(params: CreateZamaConfigWithTransports): GenericSigner {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    return new WagmiSigner({ config: params.wagmiConfig });
  }
  if ("viem" in params && params.viem) {
    return new ViemSigner(params.viem);
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

function resolveGetChainId(
  params: CreateZamaConfigWithTransports,
  signer: GenericSigner,
): () => Promise<number> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const config = params.wagmiConfig;
    return () => Promise.resolve(getChainId(config));
  }
  return () => signer.getChainId();
}

// ── Factory (widened for React adapters) ─────────────────────────────────────

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * Supports all base SDK paths plus React-specific adapters:
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
  // Base paths (custom signer / custom relayer) — delegate to sdk
  if ("relayer" in params && params.relayer) {
    return createZamaConfigBase(params);
  }
  if (
    "signer" in params &&
    params.signer &&
    !("wagmiConfig" in params) &&
    !("viem" in params) &&
    !("ethers" in params)
  ) {
    return createZamaConfigBase(params as ZamaConfigCustomSigner);
  }

  // React adapter paths — resolve signer, then use shared resolution
  const p = params as CreateZamaConfigWithTransports;
  const signer = resolveSigner(p);
  const getChainIdFn = resolveGetChainId(p, signer);

  const chainIds =
    "wagmiConfig" in p && p.wagmiConfig
      ? p.wagmiConfig.chains.map((c: { id: number; name: string }) => c.id)
      : p.chains.map((c: ExtendedFhevmInstanceConfig) => c.chainId);

  const chainNameResolver =
    "wagmiConfig" in p && p.wagmiConfig
      ? (id: number) => p.wagmiConfig?.chains.find((c: { id: number }) => c.id === id)?.name ?? id
      : undefined;

  const chainTransports = resolveChainTransports(
    p.chains,
    p.transports,
    chainIds,
    chainNameResolver,
  );
  const relayer = buildRelayer(chainTransports, getChainIdFn);

  return {
    relayer,
    signer,
    storage: params.storage ?? (typeof window !== "undefined" ? undefined : undefined),
    sessionStorage: params.sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryAddresses: params.registryAddresses,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as ZamaConfig;
}
