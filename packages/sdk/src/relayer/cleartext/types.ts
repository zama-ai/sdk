import type { EIP1193Provider } from "viem";

export interface CleartextInstanceConfig {
  network: EIP1193Provider | string;
  chainId: number;
  gatewayChainId: number;
  aclContractAddress: string;
  kmsContractAddress?: string;
  inputVerifierContractAddress?: string;
  verifyingContractAddressDecryption: string;
  verifyingContractAddressInputVerification: string;
  cleartextExecutorAddress: string;
}
