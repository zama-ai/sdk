---
title: Quick start
description: Get from zero to a working confidential transfer in under 5 minutes.
---

# Quick start

Pick your stack. Each tab gets you from install to a working confidential transfer.

The first three tabs are for **browser apps** (React dApp, vanilla viem, or ethers). The **Node.js** tabs are for backend services, scripts, and bots that operate on confidential tokens server-side — they use native worker threads instead of a Web Worker and store keys in memory.

In browser apps, prefix client-side variables with `NEXT_PUBLIC_` (Next.js) or `VITE_` (Vite) so the bundler exposes them.

## Authentication

The relayer requires an API key. In browser apps, proxy requests through your backend so the key stays server-side. Override `relayerUrl` in the chain definition to point at your proxy:

```ts
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

// Browser apps: proxy through your backend (recommended)
const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;
```

See [Authentication](/guides/authentication) for a backend proxy example.

## Install

{% tabs %}
{% tab title="React + wagmi" %}

```bash
pnpm add @zama-fhe/sdk @zama-fhe/react-sdk @tanstack/react-query wagmi viem
```

{% endtab %}
{% tab title="viem" %}

```bash
pnpm add @zama-fhe/sdk viem
```

{% endtab %}
{% tab title="ethers" %}

```bash
pnpm add @zama-fhe/sdk ethers
```

{% endtab %}
{% tab title="Node.js (viem)" %}

```bash
pnpm add @zama-fhe/sdk viem
```

{% endtab %}
{% tab title="Node.js (ethers)" %}

```bash
pnpm add @zama-fhe/sdk ethers
```

{% endtab %}
{% endtabs %}

## Set up the SDK

{% tabs %}
{% tab title="React + wagmi" %}

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { web } from "@zama-fhe/sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <MyTokenPage />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

{% endtab %}
{% tab title="viem" %}

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  relayers: {
    [mySepolia.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="ethers" %}

```ts
import { createConfig } from "@zama-fhe/sdk/ethers";
import { web, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  ethereum: window.ethereum!,
  relayers: {
    [mySepolia.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Node.js (viem)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as sepoliaViem } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({
  chain: sepoliaViem,
  transport: http(process.env.RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: sepoliaViem,
  transport: http(process.env.RPC_URL),
});

const mySepolia = { ...sepolia, network: process.env.RPC_URL! } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  storage: memoryStorage,
  relayers: {
    [mySepolia.id]: node({ poolSize: 4 }),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Node.js (ethers)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/ethers";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { Wallet, JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider(process.env.RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);

const mySepolia = { ...sepolia, network: process.env.RPC_URL! } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  ethereum: provider,
  storage: memoryStorage,
  relayers: {
    [mySepolia.id]: node({ poolSize: 4 }),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
**FHE artifact caching** — Both `web()` and `node()` relayers automatically cache the multi-MB FHE public key and parameters so they are not re-downloaded on every startup. Browser uses IndexedDB (persists across reloads), Node.js uses in-memory storage (lost on restart). The cache revalidates against the CDN every 24 hours. Configure via the relayer options in the second argument. See [FheArtifactCache](/reference/sdk/FheArtifactCache) for details.
{% endhint %}

## Your first confidential transfer

{% tabs %}
{% tab title="React + wagmi" %}

```tsx
import { type FormEvent } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  useConfidentialBalance,
  useConfidentialTransfer,
  useShield,
  useMetadata,
} from "@zama-fhe/react-sdk";

function MyTokenPage() {
  const TOKEN = "0xYourEncryptedERC20";
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: meta } = useMetadata(TOKEN);
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: TOKEN,
  });
  const { mutateAsync: shield, isPending: isShielding } = useShield({
    tokenAddress: TOKEN,
  });
  const { mutateAsync: transfer, isPending: isSending } = useConfidentialTransfer({
    tokenAddress: TOKEN,
  });

  if (!isConnected) {
    return <button onClick={() => connect({ connector: injected() })}>Connect Wallet</button>;
  }

  async function handleShield(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = new FormData(e.currentTarget).get("amount") as string;
    await shield({ amount: BigInt(amount) });
    e.currentTarget.reset();
  }

  async function handleTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const to = data.get("to") as string;
    const amount = data.get("amount") as string;
    await transfer({ to: to as `0x${string}`, amount: BigInt(amount) });
    e.currentTarget.reset();
  }

  return (
    <div>
      <p>Connected: {address}</p>
      {meta && (
        <p>
          Token: {meta.name} ({meta.symbol})
        </p>
      )}
      <p>Balance: {isLoading ? "Decrypting…" : balance?.toString()}</p>

      <form onSubmit={handleShield}>
        <fieldset disabled={isShielding}>
          <legend>Shield</legend>
          <input name="amount" type="number" placeholder="Amount" required />
          <button type="submit">{isShielding ? "Shielding…" : "Shield"}</button>
        </fieldset>
      </form>

      <form onSubmit={handleTransfer}>
        <fieldset disabled={isSending}>
          <legend>Confidential Transfer</legend>
          <input name="to" type="text" placeholder="Recipient (0x…)" required />
          <input name="amount" type="number" placeholder="Amount" required />
          <button type="submit">{isSending ? "Sending…" : "Send"}</button>
        </fieldset>
      </form>

      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
```

{% endtab %}
{% tab title="viem" %}

```ts
const token = sdk.createToken("0xYourEncryptedERC20");

// Shield 1,000 public tokens into confidential form
await token.shield(1000n);

// Decrypt your balance (first call prompts a wallet signature)
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// Send 500 tokens privately
await token.confidentialTransfer("0xRecipient", 500n);

// Withdraw back to public ERC-20
await token.unshield(500n);
```

{% endtab %}
{% tab title="ethers" %}

```ts
const token = sdk.createToken("0xYourEncryptedERC20");

// Shield 1,000 public tokens into confidential form
await token.shield(1000n);

// Decrypt your balance (first call prompts a wallet signature)
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// Send 500 tokens privately
await token.confidentialTransfer("0xRecipient", 500n);

// Withdraw back to public ERC-20
await token.unshield(500n);
```

{% endtab %}
{% tab title="Node.js (viem)" %}

```ts
const token = sdk.createToken(process.env.TOKEN_ADDRESS!);

try {
  // Shield 1,000 public tokens into confidential form
  await token.shield(1000n);

  // Decrypt your balance
  const balance = await token.balanceOf();
  console.log("Confidential balance:", balance);

  // Send 500 tokens privately
  await token.confidentialTransfer("0xRecipient", 500n);

  // Withdraw back to public ERC-20
  await token.unshield(500n);
} finally {
  sdk.terminate(); // clean up worker threads
}
```

{% endtab %}
{% tab title="Node.js (ethers)" %}

```ts
const token = sdk.createToken(process.env.TOKEN_ADDRESS!);

try {
  // Shield 1,000 public tokens into confidential form
  await token.shield(1000n);

  // Decrypt your balance
  const balance = await token.balanceOf();
  console.log("Confidential balance:", balance);

  // Send 500 tokens privately
  await token.confidentialTransfer("0xRecipient", 500n);

  // Withdraw back to public ERC-20
  await token.unshield(500n);
} finally {
  sdk.terminate(); // clean up worker threads
}
```

{% endtab %}
{% endtabs %}

The hooks and SDK methods handle FHE encryption, wallet signing, ERC-20 approvals, and cache invalidation automatically.

## Next steps

- [Configuration](/guides/configuration) -- chains, relayers, signer, storage, and authentication setup
- [Shield Tokens](/guides/shield-tokens) -- move tokens into confidential form
- [Chain Objects](/reference/sdk/network-presets) -- pre-configured chain definitions for Sepolia, Mainnet, and more
- [React Hooks](/reference/react/ZamaProvider) -- provider setup and all available hooks
- [Security Model](/concepts/security-model) -- understand the cryptography and trust assumptions
