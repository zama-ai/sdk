import type { RelayerSDK } from "@zama-fhe/sdk";
import { MainnetConfig, RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";
import {
  CleartextFhevmInstance,
  HardhatCleartextConfig,
  hoodiCleartextConfig,
} from "@zama-fhe/sdk/cleartext";
import { fhevmHardhat, fhevmHoodi, fhevmMainnet, fhevmSepolia } from "@zama-fhe/sdk/chains";
import { getChain, type FhevmConfig } from "./config";

export function resolveRelayer(config: FhevmConfig): RelayerSDK {
  const chain = getChain(config);

  switch (chain.id) {
    case fhevmMainnet.id:
    case fhevmSepolia.id: {
      const preset = chain.id === fhevmMainnet.id ? MainnetConfig : SepoliaConfig;
      const transports = {
        [chain.id]: {
          ...preset,
          ...config.relayer,
        },
      };

      return new RelayerWeb({
        transports,
        getChainId: async () => chain.id,
        threads: config.advanced?.threads,
        security:
          config.advanced?.integrityCheck !== undefined
            ? { integrityCheck: config.advanced.integrityCheck }
            : undefined,
      });
    }
    case fhevmHardhat.id:
      return new CleartextFhevmInstance(HardhatCleartextConfig);
    case fhevmHoodi.id:
      return new CleartextFhevmInstance(hoodiCleartextConfig);
  }

  throw new Error(`Unsupported FHEVM chain ${chain.id}`);
}
