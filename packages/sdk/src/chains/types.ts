import type { Address, EIP1193Provider } from "viem";

/** Authentication forwarded to a chain's relayer endpoint. */
export type FheChainAuth =
  | { __type: "BearerToken"; token: string }
  | { __type: "ApiKeyHeader"; header?: string; value: string };

/**
 * Where encryption checks the relayer's FHE public key and CRS: `contract`, the
 * `KMSGeneration` address on an Ethereum host chain, or `chain`, the Ethereum
 * chain holding it (read through its `network`), for any other host chain.
 */
export type FheKeyVerification =
  | { readonly contract: Address }
  | { readonly chain: FheChain & { readonly keyVerification: { readonly contract: Address } } };

/**
 * Complete chain configuration — the single source of truth for
 * per-chain FHE contract addresses and network settings. The built-in presets
 * exported from `@zama-fhe/sdk/chains` are `FheChain` objects.
 */
export interface FheChain<TId extends number = number> {
  /** EVM chain ID of the host chain. */
  readonly id: TId;
  /** Chain ID of the FHE gateway serving this chain. */
  readonly gatewayChainId: number;
  /** Base URL of this chain's relayer endpoint. */
  readonly relayerUrl: string;
  /** RPC network for host-chain reads — an EIP-1193 provider or an RPC URL. */
  readonly network: EIP1193Provider | string;
  /** Address of the ACL (access-control list) contract. */
  readonly aclContractAddress: Address;
  /** Address of the KMS verifier contract. */
  readonly kmsContractAddress: Address;
  /** Address of the input verifier contract. */
  readonly inputVerifierContractAddress: Address;
  /**
   * Required on a non-cleartext chain: without it, `createConfig` throws a
   * `ConfigurationError`. A chain with a built-in preset's id and ACL inherits the preset's.
   */
  readonly keyVerification?: FheKeyVerification | undefined;
  /** EIP-712 verifying contract address for decryption requests. */
  readonly verifyingContractAddressDecryption: Address;
  /** EIP-712 verifying contract address for input verification. */
  readonly verifyingContractAddressInputVerification: Address;
  /**
   * Address of the `ConfidentialTokenWrappersRegistry` contract.
   * `undefined` for chains where no registry is deployed (e.g. Hardhat).
   */
  readonly registryAddress: Address | undefined;
  /**
   * Address of the multi-vault `VaultBatcherConfidentialRouter`, one per chain.
   * A `VaultGroup` refuses to submit through any other router unless its
   * config sets `allowCustomRouter`. `undefined` where none is deployed.
   */
  readonly vaultRouterAddress?: Address;
  /**
   * Address of the `TFHEExecutor` contract (cleartext mode only).
   * Required by the `cleartext()` transport to read mock plaintexts.
   * `undefined` for chains that use real FHE infrastructure.
   */
  readonly executorAddress?: Address | undefined;
  /**
   * Authentication for the relayer endpoint.
   * Use `{ __type: "ApiKeyHeader", value: "your-key" }` for API-key auth,
   * or `{ __type: "BearerToken", token: "your-token" }` for bearer auth.
   */
  readonly auth?: FheChainAuth;
}

/** At least one chain is required. */
export type AtLeastOneChain = readonly [FheChain, ...FheChain[]];
