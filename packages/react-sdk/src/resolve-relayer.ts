import type { RelayerSDK } from "@zama-fhe/sdk";
import { MainnetConfig, RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";
import {
  CleartextFhevmInstance,
  HardhatCleartextConfig,
  hoodiCleartextConfig,
} from "@zama-fhe/sdk/cleartext";
import type { FhevmConfig } from "./config";

export function resolveRelayer(config: FhevmConfig): RelayerSDK {
  const chainId = config.chains[0]!.id;
  const overrideTransport = config.relayer?.transports?.[chainId];

  switch (chainId) {
    case 1:
    case 11155111: {
      const preset = chainId === 1 ? MainnetConfig : SepoliaConfig;
      const transports = {
        [chainId]: {
          ...preset,
          ...overrideTransport,
        },
      };

      return new RelayerWeb({
        transports,
        getChainId: async () => chainId,
        threads: config.advanced?.threads,
        security:
          config.advanced?.integrityCheck !== undefined
            ? { integrityCheck: config.advanced.integrityCheck }
            : undefined,
      });
    }
    case 31337:
      return new CleartextFhevmInstance(HardhatCleartextConfig);
    case 560048:
      return new CleartextFhevmInstance(hoodiCleartextConfig);
    default:
      return new CleartextFhevmInstance(HardhatCleartextConfig);
  }
}
