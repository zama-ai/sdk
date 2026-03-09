import type { Address, EIP1193Provider, Hex } from "viem";

export interface CleartextConfig {
  chainId: number;
  network: EIP1193Provider | string;
  gatewayChainId: number;
  aclContractAddress: Address;
  executorAddress: Address;
  /** Address of the Decryption contract on the gateway chain. */
  verifyingContractAddressDecryption: Address;
  /** Address of the InputVerification contract on the gateway chain. */
  verifyingContractAddressInputVerification: Address;
  kmsSignerPrivateKey?: Hex;
  inputSignerPrivateKey?: Hex;
}
