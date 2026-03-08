import type {
  FhevmInstanceConfig,
  GenericSigner,
  GenericStorage,
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

/** Wallet option accepted by {@link createFhevmConfig}. */
export type WalletOption = GenericSigner | WagmiAdapter;

/** Optional relayer transport overrides keyed by chain id. */
export interface RelayerOverride {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
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

/** Create an inert FHEVM config object with defaults applied. */
export function createFhevmConfig(options: FhevmConfigOptions): FhevmConfig {
  return {
    chains: options.chains,
    wallet: options.wallet,
    relayer: options.relayer,
    storage: options.storage ?? memoryStorage,
    advanced: options.advanced,
  };
}
