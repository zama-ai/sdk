import type { EIP1193Provider } from "viem";

export interface CleartextContracts {
  acl: string;
  executor: string;
  inputVerifier: string;
  kmsVerifier: string;
  verifyingInputVerifier: string;
  verifyingDecryption: string;
}

export interface CleartextConfig {
  chainId: bigint;
  gatewayChainId: number;
  contracts: CleartextContracts;
}

export interface CleartextChainConfig extends CleartextConfig {
  rpcUrl: string | EIP1193Provider;
}
