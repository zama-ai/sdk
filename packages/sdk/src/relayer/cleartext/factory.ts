import { BrowserProvider, JsonRpcProvider } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type { CleartextChainConfig } from "./types";

export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK {
  const provider =
    typeof config.rpcUrl === "string"
      ? new JsonRpcProvider(config.rpcUrl)
      : new BrowserProvider(config.rpcUrl);

  const { rpcUrl: _, ...internalConfig } = config;

  return new CleartextFhevmInstance(provider, internalConfig);
}
