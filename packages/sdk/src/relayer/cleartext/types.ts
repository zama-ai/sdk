import type { Address, EIP1193Provider, Hex } from "viem";

export interface CleartextConfig {
  chainId: number;
  network: EIP1193Provider | string;
  gatewayChainId: number;
  aclContractAddress: Address;
  executorAddress: Address;
  wrappersRegistryAddress?: Address;
  /** Address of the Decryption contract on the gateway chain. */
  verifyingContractAddressDecryption: Address;
  /** Address of the InputVerification contract on the gateway chain. */
  verifyingContractAddressInputVerification: Address;
  /** Private key of the KMS signer used for EIP-712 verification of the decryption. */
  kmsSignerPrivateKey?: Hex;
  /** Private key of the input signer used for EIP-712 verification of the input verification. */
  inputSignerPrivateKey?: Hex;
}
