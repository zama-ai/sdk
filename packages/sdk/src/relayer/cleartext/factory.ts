import { createPublicClient, custom, http } from "viem";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type {
  CleartextChainConfig,
  CleartextInstanceConfig,
  CleartextTransportConfig,
} from "./types";
import { ConfigurationError } from "../../token/errors";

export function resolveCleartextConfig(
  chainId: number,
  transport?: CleartextTransportConfig,
  chainConfig?: CleartextChainConfig,
): CleartextInstanceConfig {
  if (!transport) {
    throw new ConfigurationError(`Missing cleartext transport for chainId ${chainId}`);
  }

  if (!chainConfig) {
    throw new ConfigurationError(`Missing cleartext chain config for chainId ${chainId}`);
  }

  return {
    chainId,
    ...transport,
    ...chainConfig,
  };
}

export function createCleartextRelayer(config: CleartextInstanceConfig): RelayerSDK {
  const client = createPublicClient({
    transport: typeof config.network === "string" ? http(config.network) : custom(config.network),
  });

  return new CleartextFhevmInstance(client, config);
}
