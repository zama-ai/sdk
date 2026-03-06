import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { type ReactNode } from "react";
import type { Address } from "viem";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";
import { HardhatCleartextChainConfig, RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };

const isHardhat = import.meta.env.VITE_NETWORK === "hardhat";

const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: isHardhat
    ? [
        burner({
          rpcUrls: {
            [hardhat.id]: hardhat.rpcUrls.default.http[0],
          },
        }),
      ]
    : [injected()],
  transports: {
    [hardhat.id]: http(),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerCleartext({
  transports: {
    [hardhat.id]: {
      network: hardhat.rpcUrls.default.http[0],
    },
  },
  chainConfigs: {
    [hardhat.id]: {
      ...HardhatCleartextChainConfig,
      aclContractAddress: deployments.fhevm.acl as Address,
      cleartextExecutorAddress: deployments.fhevm.executor as Address,
    },
  },
  getChainId: () => signer.getChainId(),
});

const storage = new MemoryStorage();

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider relayer={relayer} storage={storage} signer={signer}>
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
