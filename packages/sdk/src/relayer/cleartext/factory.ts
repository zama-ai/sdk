import { createPublicClient, custom, http } from "viem";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type { CleartextChainConfig } from "./types";

export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK {
  const client = createPublicClient({
    transport: typeof config.rpcUrl === "string" ? http(config.rpcUrl) : custom(config.rpcUrl),
  });

  const { rpcUrl: _, ...internalConfig } = config;

  return new CleartextFhevmInstance(client, internalConfig);
}
