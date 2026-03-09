### viem

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

// Full mode — signing + read
const signer = new ViemSigner({ walletClient, publicClient });

// Read-only mode — omit walletClient for chain reads without a wallet
const readOnlySigner = new ViemSigner({ publicClient });
```

### ethers

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// Browser — pass the raw EIP-1193 provider
const signer = new EthersSigner({ ethereum: window.ethereum! });

// Node.js — pass an ethers Signer directly
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// const signer = new EthersSigner({ signer: new ethers.Wallet(privateKey, provider) });

// Read-only — pass a Provider for chain reads without a wallet
// const signer = new EthersSigner({ provider: new ethers.JsonRpcProvider(rpcUrl) });
```

### wagmi (React only)

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
```
