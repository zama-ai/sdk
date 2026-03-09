import type { GenericSigner } from "@zama-fhe/sdk";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { fhevmHardhat, fhevmHoodi, fhevmMainnet, fhevmSepolia } from "@zama-fhe/sdk/chains";
import { createPublicClient, http } from "viem";
import { ConfiguredChainSigner } from "./configured-chain-signer";
import {
  getChain,
  isWagmiAdapter,
  WAGMI_PROVIDER_REQUIRED_ERROR,
  type FhevmConfig,
} from "./config";
import { ReadonlyViemSigner } from "./readonly-viem-signer";

const RPC_BY_CHAIN = {
  [fhevmMainnet.id]: MainnetConfig.network,
  [fhevmSepolia.id]: SepoliaConfig.network,
  [fhevmHardhat.id]: HardhatCleartextConfig.network,
  [fhevmHoodi.id]: hoodiCleartextConfig.network,
} satisfies Record<FhevmConfig["chain"]["id"], string>;

function bindConfiguredChain(config: FhevmConfig, signer: GenericSigner): GenericSigner {
  return new ConfiguredChainSigner(getChain(config), signer);
}

export function resolveWallet(config: FhevmConfig, wagmiConfig: unknown | null): GenericSigner {
  const chain = getChain(config);
  const wallet = config.wallet;

  if (wallet && !isWagmiAdapter(wallet)) {
    return bindConfiguredChain(config, wallet);
  }

  if (wallet && isWagmiAdapter(wallet)) {
    if (!wagmiConfig) {
      throw new Error(WAGMI_PROVIDER_REQUIRED_ERROR);
    }

    return bindConfiguredChain(config, wallet.createSigner(wagmiConfig));
  }

  return new ReadonlyViemSigner({
    publicClient: createPublicClient({
      transport: http(RPC_BY_CHAIN[chain.id]),
    }),
  });
}
