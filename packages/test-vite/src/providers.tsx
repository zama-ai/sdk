import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HardhatConfig, MemoryStorage, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { burner } from "@zama-fhe/test-components";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
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
  ...HardhatConfig,
  aclContractAddress: deployments.fhevm.acl,
  inputVerifierContractAddress: deployments.fhevm.inputVerifier,
  kmsContractAddress: deployments.fhevm.kmsVerifier,
  cleartextExecutorAddress: deployments.fhevm.executor,
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
