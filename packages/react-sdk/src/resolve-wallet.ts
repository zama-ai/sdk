import type { GenericSigner } from "@zama-fhe/sdk";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import {
  HardhatCleartextConfig,
  hoodiCleartextConfig,
} from "@zama-fhe/sdk/cleartext";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, http } from "viem";
import type { Config as WagmiConfig } from "wagmi";
import type { FhevmConfig, WagmiAdapter } from "./config";
import { WagmiSigner } from "./wagmi/wagmi-signer";

const RPC_BY_CHAIN: Record<number, string> = {
  1: MainnetConfig.network,
  11155111: SepoliaConfig.network,
  31337: HardhatCleartextConfig.network,
  560048: hoodiCleartextConfig.network,
};

function isWagmiAdapter(wallet: unknown): wallet is WagmiAdapter {
  return typeof wallet === "object" && wallet !== null && (wallet as WagmiAdapter).type === "wagmi";
}

export function resolveWallet(
  config: FhevmConfig,
  wagmiConfig: WagmiConfig | null,
): GenericSigner {
  const wallet = config.wallet;

  if (wallet && !isWagmiAdapter(wallet)) {
    return wallet;
  }

  if (wallet && isWagmiAdapter(wallet)) {
    if (!wagmiConfig) {
      throw new Error("WagmiAdapter requires a WagmiProvider in the component tree.");
    }

    return new WagmiSigner({ config: wagmiConfig });
  }

  const chainId = config.chains[0]!.id;
  const rpcUrl = RPC_BY_CHAIN[chainId];

  if (!rpcUrl) {
    throw new Error(`No RPC URL known for chain ${chainId}. Provide a wallet or use a known chain.`);
  }

  const signer = new ViemSigner({
    publicClient: createPublicClient({
      transport: http(rpcUrl),
    }),
  });

  const noWalletError = new TypeError("No wallet connected — provider is in read-only mode");
  (signer as GenericSigner).getAddress = async () => {
    throw noWalletError;
  };
  (signer as GenericSigner).signTypedData = async () => {
    throw noWalletError;
  };
  (signer as GenericSigner).writeContract = async () => {
    throw noWalletError;
  };

  return signer;
}
