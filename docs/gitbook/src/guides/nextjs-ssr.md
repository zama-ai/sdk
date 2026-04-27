---
title: Next.js / SSR
description: How to use the SDK with Next.js and server-side rendering frameworks.
---

# Next.js / SSR

The SDK relies on browser APIs -- Web Workers, IndexedDB, and WebAssembly -- that are not available during server-side rendering. This guide covers the patterns you need to keep FHE operations on the client while still using Next.js App Router and SSR layouts.

## Steps

### 1. Understand the constraint

The FHE relayer runs encryption and decryption inside a Web Worker backed by a WASM binary. IndexedDB stores encrypted keypairs. None of these APIs exist in Node.js or during SSR.

This means:

- You cannot import `RelayerWeb`, `ZamaProvider`, or any SDK hook in a Server Component
- You cannot create the relayer or signer at module level in a file that runs on the server

### 2. Mark SDK components with `"use client"`

Any component that imports from `@zama-fhe/react-sdk` must be a Client Component:

```tsx
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";

export function TokenBalance({ address }: { address: string }) {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: address,
  });

  if (isLoading) return <span>Loading...</span>;
  return <span>{balance?.toString()}</span>;
}
```

### 3. Place `ZamaProvider` inside a client component

Create a dedicated client component that sets up the SDK providers. This keeps the relayer and signer initialization off the server.

```tsx
// app/providers.tsx
"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { web } from "@zama-fhe/sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
});

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: "/api/relayer/11155111",
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 4. Use the provider in your layout

The root layout is a Server Component by default. Import the client `Providers` wrapper and nest your pages inside it:

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

The layout file itself does not need `"use client"` -- it only imports a component that is already marked as a Client Component.

### 5. Avoid creating SDK objects in server components

A common mistake is initializing the relayer or signer in a shared module that gets imported by both server and client code:

```ts
// lib/sdk.ts — DO NOT do this
import { RelayerWeb } from "@zama-fhe/sdk";

// This runs during SSR and crashes — Web Worker is not available
export const relayer = new RelayerWeb({ ... });
```

Instead, keep all SDK initialization inside a `"use client"` file (like the `Providers` component above), or gate it behind a dynamic import:

```ts
// lib/sdk.ts — safe alternative
export async function getRelayer() {
  const { RelayerWeb } = await import("@zama-fhe/sdk");
  return new RelayerWeb({ ... });
}
```

### 6. Example: page with a confidential balance

Putting it all together -- a Next.js page that displays a confidential token balance:

```tsx
// app/portfolio/page.tsx (Server Component — no SDK imports here)
import { TokenBalance } from "@/components/token-balance";

export default function PortfolioPage() {
  return (
    <div>
      <h1>My Portfolio</h1>
      <TokenBalance address="0xEncryptedERC20" />
    </div>
  );
}
```

```tsx
// components/token-balance.tsx (Client Component)
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";

export function TokenBalance({ address }: { address: string }) {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: address,
  });

  if (isLoading) return <span>Decrypting...</span>;
  return <span>{balance?.toString()}</span>;
}
```

The server renders the page shell, and the `TokenBalance` client component hydrates on the browser where FHE APIs are available.

## Next steps

- [ZamaProvider](/reference/react/ZamaProvider) -- all provider props and configuration
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- balance hook API reference
- [Provider Setup](/guides/configuration) -- full examples for wagmi, viem, and ethers setups
