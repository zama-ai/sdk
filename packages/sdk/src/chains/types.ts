import type { Address, EIP1193Provider } from "viem";

/** Authentication forwarded to a chain's relayer endpoint. */
export type FheChainAuth =
  | { __type: "BearerToken"; token: string }
  | { __type: "ApiKeyHeader"; header?: string; value: string }
  | { __type: "ApiKeyCookie"; cookie?: string; value: string };

/**
 * Complete chain configuration — the single source of truth for
 * per-chain FHE contract addresses and network settings.
 *
 * All built-in presets (`mainnet`, `sepolia`, `hoodi`, `ingenTestnet`,
 * `bscTestnet`, `hardhat`) are `FheChain` objects exported from
 * `@zama-fhe/sdk/chains`.
 */
export interface FheChain<TId extends number = number> {
  readonly id: TId;
  readonly gatewayChainId: number;
  readonly relayerUrl: string;
  readonly network: EIP1193Provider | string;
  readonly aclContractAddress: Address;
  readonly kmsContractAddress: Address;
  readonly inputVerifierContractAddress: Address;
  readonly verifyingContractAddressDecryption: Address;
  readonly verifyingContractAddressInputVerification: Address;
  /**
   * Address of the `ConfidentialTokenWrappersRegistry` contract.
   * `undefined` for chains where no registry is deployed (e.g. Hardhat).
   */
  readonly registryAddress: Address | undefined;
  /**
   * Address of the `TFHEExecutor` contract (cleartext mode only).
   * Required by the `cleartext()` transport to read mock plaintexts.
   * `undefined` for chains that use real FHE infrastructure.
   */
  readonly executorAddress?: Address | undefined;
  /**
   * Address of the `ProtocolConfig` contract on the host chain.
   *
   * Required once the chain's `KMSVerifier` reaches v0.4.0 (protocol v0.14.0+):
   * without it, permit signing throws instead of resolving the current KMS
   * context/epoch. `undefined` for chains still below that protocol version.
   */
  readonly protocolConfigContractAddress?: Address | undefined;
  /**
   * Address of the `KMSGeneration` contract on the host chain.
   *
   * When set, the SDK verifies the downloaded FHE public key and CRS bytes
   * against the on-chain SHAKE256 digest before using them. `undefined`
   * (the default on every built-in preset) skips verification, matching
   * today's behavior; no chain this SDK ships presets for has
   * `KMSGeneration` deployed yet.
   */
  readonly kmsGenerationContractAddress?: Address | undefined;
  /**
   * Authentication for the relayer endpoint.
   * Use `{ __type: "ApiKeyHeader", value: "your-key" }` for API-key auth,
   * or `{ __type: "BearerToken", token: "your-token" }` for bearer auth.
   */
  readonly auth?: FheChainAuth;
}

/** At least one chain is required. */
export type AtLeastOneChain = readonly [FheChain, ...FheChain[]];
