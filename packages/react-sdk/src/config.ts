import type {
  FhevmInstanceConfig,
  GenericSigner,
  GenericStorage,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { MemoryStorage } from "@zama-fhe/sdk";
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
  useConfig: () => unknown;
  createSigner: (config: unknown) => GenericSigner;
}

export const CHAIN_REQUIRED_ERROR = "FhevmConfig.chain is required.";
export const WAGMI_PROVIDER_REQUIRED_ERROR =
  "FhevmProvider with wagmiAdapter() requires a <WagmiProvider> in the component tree.";

/** Wallet option accepted by {@link createFhevmConfig}. */
export type WalletOption = GenericSigner | WagmiAdapter;

/** Optional relayer transport override for the configured chain. */
export type RelayerOverride = Partial<FhevmInstanceConfig>;

/** Input options for building an inert FHEVM config object. */
export interface FhevmConfigOptions {
  chain: FhevmChain;
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage?: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}

/** Normalized config consumed by the provider layer. */
export interface FhevmConfig {
  chain: FhevmChain;
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}

export function isWagmiAdapter(wallet: unknown): wallet is WagmiAdapter {
  return typeof wallet === "object" && wallet !== null && (wallet as WagmiAdapter).type === "wagmi";
}

export function getChain(config: { chain?: FhevmChain }): FhevmChain {
  const chain = config.chain;

  if (!chain) {
    throw new TypeError(CHAIN_REQUIRED_ERROR);
  }

  return chain;
}

/** Create an inert FHEVM config object with defaults applied. */
export function createFhevmConfig(options: FhevmConfigOptions): FhevmConfig {
  const chain = getChain(options);

  return {
    chain,
    wallet: options.wallet,
    relayer: options.relayer,
    storage: options.storage ?? new MemoryStorage(),
    advanced: options.advanced,
  };
}
