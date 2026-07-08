### viem

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { createConfig } from "@zama-fhe/sdk/viem";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });
```

### ethers

```ts
import { createConfig } from "@zama-fhe/sdk/ethers";

// Browser — pass the raw EIP-1193 provider
// createConfig({ chains: [...], ethereum: window.ethereum!, relayers: { ... } })

// Node.js — pass an ethers Signer directly
// createConfig({ chains: [...], signer: wallet, relayers: { ... } })
```

### wagmi (React only)

```tsx
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// Wrap your app
<ZamaProvider config={zamaConfig}>
  <App />
</ZamaProvider>;
```
