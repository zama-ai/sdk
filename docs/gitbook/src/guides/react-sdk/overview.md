# React SDK

The React SDK (`@zama-fhe/react-sdk`) gives you hooks for confidential token operations — balances, transfers, shielding, unshielding — built on [React Query](https://tanstack.com/query). It handles caching, polling, encryption, and wallet interactions so your components stay simple.

## Install

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query
```

You **don't** need to install `@zama-fhe/sdk` separately — it's included and re-exported, so you import everything from one place.

Then add your Web3 library:

```bash
# Pick one (or more):
pnpm add wagmi viem    # wagmi (most common for React dApps)
pnpm add viem          # viem only
pnpm add ethers        # ethers only
```

## Minimal example

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  RelayerWeb,
  indexedDBStorage,
  useConfidentialBalance,
  useShield,
} from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

// Setup (see Quick Start for the full wagmi config)
const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerWeb({
  /* ... */
});

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
        <TokenCard />
      </ZamaProvider>
    </QueryClientProvider>
  );
}

function TokenCard() {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: "0xToken",
  });
  const { mutateAsync: shield } = useShield({ tokenAddress: "0xToken" });

  return (
    <div>
      <p>{isLoading ? "Decrypting..." : `Balance: ${balance}`}</p>
      <button onClick={() => shield({ amount: 1000n })}>Shield 1,000</button>
    </div>
  );
}
```

## How it works under the hood

### Smart balance polling

Balance hooks use a two-phase approach to avoid expensive decryption on every poll:

1. **Phase 1 (cheap)** — polls the encrypted handle via a normal RPC read every 10 seconds
2. **Phase 2 (expensive)** — only when the handle changes (meaning the balance was updated on-chain), triggers FHE decryption via the relayer

This means your UI stays responsive without hammering the relayer.

### Automatic cache management

Mutation hooks (`useConfidentialTransfer`, `useShield`, `useUnshield`, etc.) automatically invalidate the relevant balance caches when a transaction succeeds. You don't need to manually refresh anything.

### One import source

The main entry point re-exports everything from `@zama-fhe/sdk` — classes, types, ABIs, error types, event decoders, everything. You never need to import from both packages:

```ts
// This gives you everything
import { ZamaProvider, useShield, ZamaError, matchZamaError } from "@zama-fhe/react-sdk";
```

## Next.js / SSR

All SDK hooks require browser APIs (Web Worker, IndexedDB). Mark any file that uses them as a client component:

```tsx
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

Place `ZamaProvider` inside a client component. Don't create the relayer or signer at module level in a server component.

## Next steps

- [Provider Setup](provider-setup.md) — full setup examples for wagmi, viem, ethers, and custom signers
- [Hooks](hooks.md) — all available hooks and how to use them
- [Choosing the Right Hook](hook-disambiguation.md) — main hooks vs library-adapter hooks
- [Library Adapters](library-adapters.md) — low-level hooks for advanced use cases
