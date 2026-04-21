import type { Provider, Signer } from "ethers";
import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { FheChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericSigner, GenericStorage } from "../types";
import type { TransportConfig } from "./transports";

/** Shared options across all adapter paths. */
export interface ZamaConfigBase {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: FheChain[];
  /** Per-chain transport configuration. Every chain must have a transport entry. */
  transports: Record<number, TransportConfig>;
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDB in browser, memory in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
}

/** Viem path — takes native viem clients. */
export interface ZamaConfigViem extends ZamaConfigBase {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    ethereum?: EIP1193Provider;
  };
  relayer?: never;
  signer?: never;
  ethers?: never;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  signer?: never;
  viem?: never;
}

/** Custom GenericSigner with explicit transports. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  relayer?: never;
  viem?: never;
  ethers?: never;
}

/** Config params accepted by the base SDK (no wagmi). */
export type CreateZamaConfigBaseParams = ZamaConfigViem | ZamaConfigEthers | ZamaConfigCustomSigner;

/** @internal Nominal brand — prevents constructing ZamaConfig as a plain object literal. */
declare const __brand: unique symbol;

/** Opaque config object returned by {@link createZamaConfig}. */
export interface ZamaConfig {
  /** @internal */ readonly [__brand]: true;
  /** @internal */ readonly chains: readonly FheChain[];
  /** @internal */ readonly relayer: RelayerSDK;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}
