import { BrowserProvider, JsonRpcProvider } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type { CleartextChainConfig, CleartextFhevmConfig } from "./types";

export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK {
  const provider =
    typeof config.rpcUrl === "string"
      ? new JsonRpcProvider(config.rpcUrl)
      : new BrowserProvider(config.rpcUrl);

  const internalConfig: CleartextFhevmConfig = {
    chainId: config.chainId,
    gatewayChainId: config.gatewayChainId,
    aclAddress: config.contracts.acl,
    executorProxyAddress: config.contracts.executor,
    inputVerifierContractAddress: config.contracts.inputVerifier,
    kmsContractAddress: config.contracts.kmsVerifier,
    verifyingContractAddressInputVerification: config.contracts.verifyingInputVerifier,
    verifyingContractAddressDecryption: config.contracts.verifyingDecryption,
  };

  return new CleartextFhevmInstance(provider, internalConfig);
}
