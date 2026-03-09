import type { GenericSigner } from "@zama-fhe/sdk";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { fhevmHardhat, fhevmHoodi, fhevmMainnet, fhevmSepolia } from "@zama-fhe/sdk/chains";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, http } from "viem";
import { isWagmiAdapter, WAGMI_PROVIDER_REQUIRED_ERROR, type FhevmConfig } from "./config";

const RPC_BY_CHAIN = {
  [fhevmMainnet.id]: MainnetConfig.network,
  [fhevmSepolia.id]: SepoliaConfig.network,
  [fhevmHardhat.id]: HardhatCleartextConfig.network,
  [fhevmHoodi.id]: hoodiCleartextConfig.network,
} satisfies Record<FhevmConfig["chain"]["id"], string>;

export function resolveWallet(config: FhevmConfig, wagmiConfig: unknown): GenericSigner {
  const wallet = config.wallet;

  if (!wallet) {
    return new ViemSigner({
      publicClient: createPublicClient({
        transport: http(RPC_BY_CHAIN[config.chain.id]),
      }),
    });
  }

  if (isWagmiAdapter(wallet)) {
    if (!wagmiConfig) {
      throw new Error(WAGMI_PROVIDER_REQUIRED_ERROR);
    }

    return wallet.createSigner(wagmiConfig);
  }

  return wallet;
}
