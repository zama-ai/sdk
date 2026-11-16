import type { Address, EIP1193Provider } from "viem";

/** Authentication forwarded to a chain's relayer endpoint. */
export type FheChainAuth =
  | { __type: "BearerToken"; token: string }
  | { __type: "ApiKeyHeader"; header?: string; value: string };

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
   * Address of the `ProtocolConfig` contract. Required to sign or use V2
   * (unified) decryption permits — including {@link WILDCARD_PERMIT} — which
   * need protocol v0.14+. Leave `undefined` for a chain still on protocol
   * ≤0.13, or one whose `ProtocolConfig` address isn't known yet: V2 permit
   * signing then fails with a clear {@link UnifiedPermitNotSupportedError}
   * instead of a wallet prompt. V1 permits are unaffected either way.
   */
  readonly protocolConfigContractAddress?: Address | undefined;
  /**
   * Address of the `KMSGeneration` contract, which records the digests of the
   * active FHE public key and CRS. Encryption checks the key material the
   * relayer serves against it. Ethereum host chains only; other host chains
   * set {@link FheChain.keyVerificationChain} instead. Left unset on a chain
   * with the id and ACL of a built-in preset, it is taken from that preset. A
   * chain with a preset's id but another ACL drops the preset's value it got by
   * spreading the preset, so set it to that deployment's own contract.
   */
  readonly kmsGenerationContractAddress?: Address | undefined;
  /**
   * The Ethereum chain whose `KMSGeneration` contract the key material of this
   * non-Ethereum host chain is checked against, read through its `network`.
   * Encryption on a non-cleartext chain needs this or
   * {@link FheChain.kmsGenerationContractAddress}.
   */
  readonly keyVerificationChain?: FheChain | undefined;
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
