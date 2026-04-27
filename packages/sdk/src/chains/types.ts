import type { Address, EIP1193Provider, Hex } from "viem";

/**
 * Complete chain configuration — the single source of truth for
 * per-chain FHE contract addresses and network settings.
 *
 * All built-in presets (`mainnet`, `sepolia`, `hardhat`, `hoodi`)
 * are `FheChain` objects exported from `@zama-fhe/sdk/chains`.
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
  /** Private key of the KMS signer used for EIP-712 verification of the decryption (cleartext mode). */
  readonly kmsSignerPrivateKey?: Hex;
  /** Private key of the input signer used for EIP-712 verification of the input verification (cleartext mode). */
  readonly inputSignerPrivateKey?: Hex;
}

/** At least one chain is required. */
export type AtLeastOneChain = readonly [FheChain, ...FheChain[]];
