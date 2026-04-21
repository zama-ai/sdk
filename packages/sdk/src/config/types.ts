import type { FheChain, AtLeastOneChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericSigner, GenericStorage } from "../types";
import type { TransportConfig } from "./transports";

export type { AtLeastOneChain };

/** Shared options across all adapter paths. */
export interface ZamaConfigBase<TChains extends AtLeastOneChain = AtLeastOneChain> {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: TChains;
  /** Per-chain transport configuration. Every chain must have a transport entry. */
  transports: { [K in TChains[number]["id"]]: TransportConfig };
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

/** @internal Nominal brand — prevents constructing ZamaConfig as a plain object literal. */
declare const __brand: unique symbol;

/** Opaque config object returned by `createConfig`. */
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
