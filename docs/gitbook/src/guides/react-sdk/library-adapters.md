# Library Adapters

The SDK provides signer adapters for each major Web3 library. Each adapter implements the `GenericSigner` interface so the SDK can sign transactions, read from contracts, and respond to wallet lifecycle events.

## Signer adapters

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
```

### wagmi (React)

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
```

Auto-revokes the session on disconnect and account change via wagmi's `watchConnection`.

### viem

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

// Full mode — signing + read
const signer = new ViemSigner({ walletClient, publicClient });

// Read-only mode — omit walletClient for chain reads without a wallet
const readOnlySigner = new ViemSigner({ publicClient });
```

When `walletClient` is omitted, methods that require signing throw at runtime. Read methods work normally.

### ethers

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// Browser — pass the raw EIP-1193 provider (subscribe() works automatically)
const signer = new EthersSigner({ ethereum: window.ethereum! });

// Node.js — pass an ethers Signer directly
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// const signer = new EthersSigner({ signer: new ethers.Wallet(privateKey, provider) });

// Read-only — pass a Provider (no signing, chain reads only)
// const signer = new EthersSigner({ provider: new ethers.JsonRpcProvider(rpcUrl) });
```

## Contract call builders

For direct contract-level control without the high-level `Token` abstraction, the SDK exports contract call builders and library-specific helpers.

### Generic builders (any signer)

Return `{ address, abi, functionName, args }` objects you can pass to any signer's `writeContract` or `readContract`:

```ts
import { wrapContract, confidentialTransferContract } from "@zama-fhe/sdk";
```

See [Contract Call Builders](../sdk/contract-builders.md) for the full list.

### viem helpers

Thin wrappers that call viem's `readContract` / `writeContract` directly:

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/viem";

const handle = await readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);
const hash = await writeWrapContract(walletClient, wrapperAddress, toAddress, amount);
```

### ethers helpers

Same API, backed by ethers `Contract`:

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/ethers";

const handle = await readConfidentialBalanceOfContract(provider, tokenAddress, userAddress);
const hash = await writeWrapContract(signer, wrapperAddress, toAddress, amount);
```
