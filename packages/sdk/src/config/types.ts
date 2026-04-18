import type { Provider, Signer } from "ethers";
import type { Address, EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { GenericSigner, GenericStorage } from "../types";
import type { TransportConfig } from "./transports";

/** Shared options across all adapter paths. */
export interface ZamaConfigBase {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: ExtendedFhevmInstanceConfig[];
  /** Per-chain transport configuration. */
  transports?: Record<number, TransportConfig>;
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDB in browser, memory in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Per-chain registry address overrides. */
  registryAddresses?: Record<number, Address>;
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
  transports: Record<number, TransportConfig>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, TransportConfig>;
}

/** Custom GenericSigner with explicit transports. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  relayer?: never;
  viem?: never;
  ethers?: never;
  transports: Record<number, TransportConfig>;
}

/** Config params accepted by the base SDK (no wagmi). */
export type CreateZamaConfigBaseParams = ZamaConfigViem | ZamaConfigEthers | ZamaConfigCustomSigner;

/** Opaque config object returned by {@link createZamaConfig}. */
export interface ZamaConfig {
  /** @internal */ readonly relayer: RelayerSDK;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryAddresses: Record<number, Address> | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}
