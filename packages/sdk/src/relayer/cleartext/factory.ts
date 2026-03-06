import { createPublicClient, custom, http } from "viem";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type { CleartextInstanceConfig } from "./types";

export function createCleartextRelayer(config: CleartextInstanceConfig): RelayerSDK {
  const client = createPublicClient({
    transport: typeof config.network === "string" ? http(config.network) : custom(config.network),
  });

  return new CleartextFhevmInstance(client, config);
}
