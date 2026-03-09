import type {
  GenericSigner,
  GenericStorage,
  RelayerWebConfig,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { memoryStorage } from "@zama-fhe/sdk";
import type { FhevmChain } from "@zama-fhe/sdk/chains";

/** Advanced runtime options forwarded to SDK initialization. */
export interface FhevmAdvancedOptions {
  threads?: number;
  keypairTTL?: number;
  sessionTTL?: number;
  onEvent?: ZamaSDKEventListener;
  integrityCheck?: boolean;
}

/** Lazy adapter marker for integrating a wallet from wagmi context. */
export interface WagmiAdapter {
  type: "wagmi";
}

export const EMPTY_CHAINS_ERROR = "FhevmConfig.chains must contain at least one chain.";
export const WAGMI_PROVIDER_REQUIRED_ERROR =
  "FhevmProvider with wagmiAdapter() requires a <WagmiProvider> in the component tree.";

/** Wallet option accepted by {@link createFhevmConfig}. */
export type WalletOption = GenericSigner | WagmiAdapter;

/** Optional relayer transport overrides keyed by chain id. */
export interface RelayerOverride {
  transports: RelayerWebConfig["transports"];
}

/** Input options for building an inert FHEVM config object. */
export interface FhevmConfigOptions {
  chains: FhevmChain[];
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage?: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}

/** Normalized config consumed by the provider layer. */
export interface FhevmConfig {
  chains: FhevmChain[];
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}

export function isWagmiAdapter(wallet: unknown): wallet is WagmiAdapter {
  return typeof wallet === "object" && wallet !== null && (wallet as WagmiAdapter).type === "wagmi";
}

export function getPrimaryChain(config: Pick<FhevmConfigOptions, "chains">): FhevmChain {
  const chain = config.chains[0];

  if (!chain) {
    throw new TypeError(EMPTY_CHAINS_ERROR);
  }

  return chain;
}

/** Create an inert FHEVM config object with defaults applied. */
export function createFhevmConfig(options: FhevmConfigOptions): FhevmConfig {
  getPrimaryChain(options);

  return {
    chains: options.chains,
    wallet: options.wallet,
    relayer: options.relayer,
    storage: options.storage ?? memoryStorage,
    advanced: options.advanced,
  };
}
