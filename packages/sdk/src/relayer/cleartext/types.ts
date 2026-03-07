import type { EIP1193Provider } from "viem";
import { type Address } from "viem";

export interface CleartextContracts {
  acl: Address;
  executor: Address;
  inputVerifier: Address;
  kmsVerifier: Address;
  verifyingInputVerifier: Address;
  verifyingDecryption: Address;
}

export interface CleartextConfig {
  chainId: bigint;
  gatewayChainId: number;
  contracts: CleartextContracts;
}

export interface CleartextChainConfig extends CleartextConfig {
  rpcUrl: string | EIP1193Provider;
}
