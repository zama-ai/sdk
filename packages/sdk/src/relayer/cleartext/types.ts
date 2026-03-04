import type { Eip1193Provider } from "ethers";

export interface CleartextFhevmConfig {
  chainId: bigint;
  gatewayChainId: number;
  aclAddress: string;
  executorProxyAddress: string;
  inputVerifierContractAddress: string;
  kmsContractAddress: string;
  verifyingContractAddressInputVerification: string;
  verifyingContractAddressDecryption: string;
}

export interface CleartextChainConfig {
  chainId: bigint;
  gatewayChainId: number;
  rpcUrl: string | Eip1193Provider;
  contracts: {
    acl: string;
    executor: string;
    inputVerifier: string;
    kmsVerifier: string;
    verifyingInputVerifier: string;
    verifyingDecryption: string;
  };
}
