import type { Address, EIP1193Provider } from "viem";

export interface CleartextConfig {
  chainId: number;
  network: EIP1193Provider | string;
  gatewayChainId: number;
  aclContractAddress: Address;
  verifyingContractAddressDecryption: Address;
  verifyingContractAddressInputVerification: Address;
  cleartextExecutorAddress: Address;
}
