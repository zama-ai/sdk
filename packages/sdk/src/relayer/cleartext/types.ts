import type { Address, Hex } from "viem";
import type { RelayerChainConfig } from "../../chains/types";

/**
 * Configuration for the cleartext transport.
 *
 * Extends `RelayerChainConfig` (the shared per-chain config shape) with
 * cleartext-specific fields. `executorAddress` is narrowed to `Address`
 * (required) because cleartext mode reads mock plaintexts from the
 * TFHEExecutor contract.
 */
export interface CleartextConfig extends RelayerChainConfig {
  executorAddress: Address;
  /** Private key of the KMS signer used for EIP-712 verification of the decryption. */
  kmsSignerPrivateKey?: Hex;
  /** Private key of the input signer used for EIP-712 verification of the input verification. */
  inputSignerPrivateKey?: Hex;
}
