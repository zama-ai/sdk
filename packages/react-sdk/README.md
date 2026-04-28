# @zama-fhe/react-sdk

React bindings for the Zama SDK. Use this package to wire confidential token operations into a React app through `ZamaProvider` and hooks for balances, transfers, shielding, unshielding, approvals, and delegation.

This package sits on top of `@zama-fhe/sdk`, which provides the core SDK, adapters, relayer factories, and chain presets.

## Installation

The example below uses `wagmi`, so install:

```bash
pnpm add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query wagmi viem
# or
npm install @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query wagmi viem
# or
yarn add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query wagmi viem
```

React apps typically install both `@zama-fhe/react-sdk` and `@zama-fhe/sdk`.

If you already build a `ZamaConfig` with the core SDK, you can pass it directly to `ZamaProvider` and only install the dependencies required by your chosen adapter.

Common peer dependencies:

| Package                 | Version                                      | Use when...                        |
| ----------------------- | -------------------------------------------- | ---------------------------------- |
| `react`                 | `>= 18`                                      | Always                             |
| `@tanstack/react-query` | `>= 5`                                       | Always                             |
| `@zama-fhe/sdk`         | Match the `@zama-fhe/react-sdk` release line | Always                             |
| `wagmi`                 | `>= 2`                                       | Using the wagmi adapter            |
| `viem`                  | `>= 2`                                       | Using wagmi or viem-based adapters |

## Minimal React example

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { ZamaWagmiProvider } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const chain = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const queryClient = new QueryClient();

function Balance() {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: "0xYourEncryptedERC20",
  });

  if (isLoading) return <p>Decrypting...</p>;
  return <p>Balance: {balance?.toString()}</p>;
}

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaWagmiProvider chains={[chain]} relayers={{ [chain.id]: web() }}>
          <Balance />
        </ZamaWagmiProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

If you need a different integration pattern, start from the [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) and the [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md).

## Using the provider and hooks

- For wagmi-based apps, `ZamaWagmiProvider` is the shortest setup. It derives the signer and provider from wagmi context for you.
- `ZamaProvider` accepts a prebuilt `ZamaConfig` when you need a custom or non-wagmi integration.
- Hooks from `@zama-fhe/react-sdk` handle confidential operations, cached decryption, and query invalidation for you.
- Lower-level SDK utilities, adapters, and token classes still come from `@zama-fhe/sdk`.

## Common hooks

- `useConfidentialBalance` reads and decrypts one token balance.
- `useConfidentialTransfer` sends a confidential transfer and invalidates affected queries.
- `useShield` converts public ERC-20 balances into confidential balances.
- `useUnshield` moves confidential balances back to public ERC-20 balances.
- `useDelegateDecryption` grants another account permission to decrypt a balance.

## Documentation

- [Official documentation](https://docs.zama.org/protocol) is the best starting point for the hosted SDK docs.
- [Overview](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/README.md) explains how the SDK docs are organized.
- [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) shows the full React + wagmi setup from install to first transfer.
- [Build your first confidential dApp](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/first-confidential-dapp.md) walks through an end-to-end React app.
- [React reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/react/README.md) documents all hooks, provider components, and query helpers.
- [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md) cover focused topics such as authentication, SSR, browser extensions, balances, and transfers.
- [Core SDK reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/sdk/README.md) documents lower-level SDK classes, adapters, and utilities.

## Support

- [Community forum](https://community.zama.ai/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
