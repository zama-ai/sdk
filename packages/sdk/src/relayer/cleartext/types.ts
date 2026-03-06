import type { Address, EIP1193Provider } from "viem";

export interface CleartextTransportConfig {
  network: EIP1193Provider | string;
}

export interface CleartextChainConfig {
  gatewayChainId: number;
  aclContractAddress: Address;
  verifyingContractAddressDecryption: Address;
  verifyingContractAddressInputVerification: Address;
  cleartextExecutorAddress: Address;
}

export interface CleartextInstanceConfig extends CleartextTransportConfig, CleartextChainConfig {
  chainId: number;
}

export interface RelayerCleartextConfig {
  transports: Record<number, CleartextTransportConfig>;
  chainConfigs: Record<number, CleartextChainConfig>;
  getChainId: () => Promise<number>;
}
