import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";

// 1. Configure wagmi
const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

// 2. Create a React Query client
const queryClient = new QueryClient();

// 3. Configure the Zama SDK
const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

// 4. Wrap your app
function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          {/* Your app components */}
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
