# @zama-fhe/react-sdk

React bindings for the Zama SDK. Use this package to wire confidential smart contract operations into a React app through `ZamaProvider` and hooks for authorization, encryption, balances, transfers, shielding, unshielding, approvals, and delegation.

## Installation

Install the React package, the core SDK, and React Query:

```bash
pnpm add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query
# or
npm install @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query
# or
yarn add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query
```

If you follow the viem example below, add `viem` too:

```bash
pnpm add viem
# or
npm install viem
# or
yarn add viem
```

`react` >= 18 is required. If you already build a `ZamaConfig` with the core SDK, pass it directly to `ZamaProvider`.

## Minimal React example

```tsx
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  useGrantPermit,
  useConfidentialBalance,
  useHasPermit,
} from "@zama-fhe/react-sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";
import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { sepolia } from "viem/chains";

const tokenAddress = "0xYourConfidentialToken" as Address;
const rpcUrl = "https://sepolia.infura.io/v3/YOUR_KEY";
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const chain = {
  ...sepoliaFhe,
  network: rpcUrl,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const queryClient = new QueryClient();
const zamaConfig = createConfig({
  chains: [chain],
  publicClient,
  walletClient,
  relayers: { [chain.id]: web() },
});

function AuthGate({
  contractAddresses,
  children,
}: {
  contractAddresses: Address[];
  children: ReactNode;
}) {
  const { data: hasPermit, isLoading: isChecking } = useHasPermit({ contractAddresses });
  const { mutateAsync: grantPermit, isPending: isAuthorizing } = useGrantPermit();

  if (isChecking) return <p>Checking authorization...</p>;
  if (hasPermit) return <>{children}</>;

  return (
    <button onClick={() => void grantPermit(contractAddresses)} disabled={isAuthorizing}>
      {isAuthorizing ? "Signing..." : "Authorize decryption"}
    </button>
  );
}

function Balance() {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress,
  });

  if (isLoading) return <p>Decrypting...</p>;
  return <p>Balance: {balance?.toString()}</p>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={zamaConfig}>
        <AuthGate contractAddresses={[tokenAddress]}>
          <Balance />
        </AuthGate>
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

This keeps `Balance` from mounting until the contract is authorized, so the first decrypt happens after an explicit user action instead of an unsolicited wallet popup.

If you need a wagmi-based setup or another integration pattern, start from the [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) and the [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md).

## Using the provider and hooks

- `ZamaProvider` accepts a prebuilt `ZamaConfig`, so you can pair the React hooks with viem, ethers, or another signer setup from the core SDK.
- For wagmi-based apps, follow the Quick start and guides for the current recommended setup.
- Hooks from `@zama-fhe/react-sdk` handle confidential operations, cached decryption, and query invalidation for you.
- Lower-level SDK utilities, adapters, and token classes still come from `@zama-fhe/sdk`.

## Common hooks

- `useHasPermit` and `useGrantPermit` let you gate decrypt flows behind an explicit user action.
- `useConfidentialBalance` reads and decrypts one token balance.
- `useConfidentialTransfer` sends a confidential transfer and invalidates affected queries.
- `useShield` converts public ERC-20 balances into confidential balances.
- `useUnshield` moves confidential balances back to public ERC-20 balances.
- `useDelegateDecryption` grants another account permission to decrypt a balance.

## Documentation

- [Official documentation](https://docs.zama.org/protocol) is the best starting point for the hosted SDK docs.
- [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) shows the full React setup from install to first transfer.
- [React reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/react/README.md) documents all hooks, provider components, and query helpers.
- [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md) cover focused topics such as authentication, SSR, browser extensions, balances, and transfers.
- [Core SDK reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/sdk/README.md) documents lower-level SDK classes, adapters, and utilities.
