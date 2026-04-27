---
title: Build your first confidential dApp
description: End-to-end tutorial building a token dashboard with React, wagmi, and the Zama React SDK.
---

# Build your first confidential dApp

We'll build a token dashboard that shows a confidential balance, lets users shield tokens, transfer privately, and unshield. The finished app uses React, wagmi, and the Zama React SDK.

## What you'll build

A single-page dashboard where a connected wallet can manage confidential ERC-20 tokens -- shield, view balance, transfer, and unshield -- all from one screen.

## Prerequisites

- Node.js 18+
- A wallet browser extension (MetaMask or similar)
- Testnet ETH on Sepolia
- An encrypted ERC-20 token address deployed on Sepolia

## 1. Create the project

Scaffold a new Vite project with React and TypeScript:

```bash
pnpm create vite@latest my-confidential-dapp -- --template react-ts
cd my-confidential-dapp
```

## 2. Install dependencies

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query wagmi viem
```

`@zama-fhe/react-sdk` re-exports everything from the core SDK, so we never need to import from `@zama-fhe/sdk` directly.

## 3. Configure wagmi and the SDK

Create `src/config.ts`. This file sets up wagmi, the signer, and the relayer -- the three pieces every Zama app needs.

{% tabs %}
{% tab title="src/config.ts" %}

```ts
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient } from "@tanstack/react-query";
import { web } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
  },
});

export const queryClient = new QueryClient();

export const TOKEN_ADDRESS = "0xYourEncryptedERC20" as const;

// If your token uses a separate wrapper contract, set it here.
// Omit if the token address is also the wrapper.
export const WRAPPER_ADDRESS = "0xYourWrapperAddress" as const;
```

{% endtab %}
{% endtabs %}

Replace `YOUR_KEY` with your Infura (or Alchemy) project ID, and update the relayer URL to point at your backend proxy. See the [Authentication guide](/guides/authentication) for proxy setup details.

## 4. Create the App layout with providers

Replace the contents of `src/App.tsx`. We wrap the app in three providers: wagmi for wallet state, React Query for async caching, and `ZamaProvider` for FHE operations.

{% tabs %}
{% tab title="src/App.tsx" %}

```tsx
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { wagmiConfig, queryClient, zamaConfig } from "./config";
import { Dashboard } from "./Dashboard";

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <h1>Confidential Token Dashboard</h1>
          <Dashboard />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

{% endtab %}
{% endtabs %}

## 5. Build the balance display

Create `src/BalanceDisplay.tsx`. The `useConfidentialBalance` hook decrypts the on-chain balance. It polls the encrypted handle cheaply and only triggers full decryption when the balance changes.

{% tabs %}
{% tab title="src/BalanceDisplay.tsx" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { TOKEN_ADDRESS } from "./config";

export function BalanceDisplay() {
  const {
    data: balance,
    isLoading,
    error,
  } = useConfidentialBalance({
    tokenAddress: TOKEN_ADDRESS,
  });

  if (error) return <p>Failed to load balance.</p>;

  return (
    <div>
      <h2>Confidential Balance</h2>
      <p>{isLoading ? "Decrypting..." : balance?.toString()}</p>
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

The first call prompts the wallet for a signature to generate FHE decrypt credentials. Subsequent calls reuse cached credentials silently.

## 6. Add shielding

Create `src/ShieldForm.tsx`. Shielding converts public ERC-20 tokens into their encrypted form. The SDK handles the ERC-20 approval automatically.

{% tabs %}
{% tab title="src/ShieldForm.tsx" %}

```tsx
import { type FormEvent } from "react";
import { useShield } from "@zama-fhe/react-sdk";
import { TOKEN_ADDRESS, WRAPPER_ADDRESS } from "./config";

export function ShieldForm() {
  const { mutateAsync: shield, isPending } = useShield({
    tokenAddress: TOKEN_ADDRESS,
    wrapperAddress: WRAPPER_ADDRESS,
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amount = data.get("amount") as string;
    await shield({ amount: BigInt(amount) });
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={isPending}>
        <legend>Shield Tokens</legend>
        <label>
          Amount
          <input name="amount" type="number" placeholder="Amount to shield" required />
        </label>
        <button type="submit">{isPending ? "Shielding…" : "Shield"}</button>
      </fieldset>
    </form>
  );
}
```

{% endtab %}
{% endtabs %}

After a successful shield, the balance display updates automatically -- mutation hooks invalidate the relevant caches.

## 7. Add confidential transfers

Create `src/TransferForm.tsx`. The transfer amount is encrypted before it reaches the chain. Nobody can see how much was sent.

{% tabs %}
{% tab title="src/TransferForm.tsx" %}

```tsx
import { type FormEvent } from "react";
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
import { TOKEN_ADDRESS } from "./config";

export function TransferForm() {
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress: TOKEN_ADDRESS,
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const to = data.get("to") as string;
    const amount = data.get("amount") as string;
    await transfer({ to: to as `0x${string}`, amount: BigInt(amount) });
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={isPending}>
        <legend>Confidential Transfer</legend>
        <label>
          Recipient
          <input name="to" type="text" placeholder="0x…" required />
        </label>
        <label>
          Amount
          <input name="amount" type="number" placeholder="Amount" required />
        </label>
        <button type="submit">{isPending ? "Sending…" : "Send"}</button>
      </fieldset>
    </form>
  );
}
```

{% endtab %}
{% endtabs %}

## 8. Add unshielding

Create `src/UnshieldForm.tsx`. Unshielding withdraws confidential tokens back to public ERC-20. This is a two-step on-chain process (unwrap + finalize), but the hook orchestrates it in a single call. We use progress callbacks to update the UI.

{% tabs %}
{% tab title="src/UnshieldForm.tsx" %}

```tsx
import { useState, type FormEvent } from "react";
import { useUnshield } from "@zama-fhe/react-sdk";
import { TOKEN_ADDRESS, WRAPPER_ADDRESS } from "./config";

export function UnshieldForm() {
  const [status, setStatus] = useState("");
  const { mutateAsync: unshield, isPending } = useUnshield({
    tokenAddress: TOKEN_ADDRESS,
    wrapperAddress: WRAPPER_ADDRESS,
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amount = data.get("amount") as string;
    setStatus("Submitting unwrap…");
    await unshield({
      amount: BigInt(amount),
      onUnwrapSubmitted: (txHash) => setStatus(`Unwrap submitted: ${txHash}`),
      onFinalizing: () => setStatus("Waiting for decryption proof…"),
      onFinalizeSubmitted: (txHash) => setStatus(`Complete: ${txHash}`),
    });
    e.currentTarget.reset();
    setStatus("");
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={isPending}>
        <legend>Unshield Tokens</legend>
        <label>
          Amount
          <input name="amount" type="number" placeholder="Amount to unshield" required />
        </label>
        <button type="submit">{isPending ? "Unshielding…" : "Unshield"}</button>
      </fieldset>
      {status && <p>{status}</p>}
    </form>
  );
}
```

{% endtab %}
{% endtabs %}

See [Hooks > useUnshield](/reference/react/useUnshield) for the full callback reference.

## 9. Add error handling

Create `src/ErrorMessage.tsx`. The `matchZamaError` utility maps SDK error codes to user-friendly messages without long `instanceof` chains. See [Error Handling](/guides/handle-errors) for the full list of error codes.

{% tabs %}
{% tab title="src/ErrorMessage.tsx" %}

```tsx
import { matchZamaError } from "@zama-fhe/react-sdk";

export function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;

  const message = matchZamaError(error, {
    SIGNING_REJECTED: () => "Transaction cancelled -- please approve in your wallet.",
    ENCRYPTION_FAILED: () => "Encryption failed -- try again.",
    TRANSACTION_REVERTED: () => "Transaction failed on-chain -- check your balance.",
    KEYPAIR_EXPIRED: () => "Session expired -- sign again to continue.",
    _: (e) => e.message,
  });

  return <p style={{ color: "red" }}>{message ?? "An unexpected error occurred."}</p>;
}
```

{% endtab %}
{% endtabs %}

Use this component alongside any mutation hook. Pass the hook's `error` property:

```tsx
const {
  mutateAsync: shield,
  isPending,
  error,
} = useShield({ tokenAddress: TOKEN_ADDRESS, wrapperAddress: WRAPPER_ADDRESS });

// In your JSX:
<ErrorMessage error={error} />;
```

## 10. Wire it up

Create `src/Dashboard.tsx` to bring all components together.

{% tabs %}
{% tab title="src/Dashboard.tsx" %}

```tsx
import { BalanceDisplay } from "./BalanceDisplay";
import { ShieldForm } from "./ShieldForm";
import { TransferForm } from "./TransferForm";
import { UnshieldForm } from "./UnshieldForm";

export function Dashboard() {
  return (
    <div>
      <BalanceDisplay />
      <hr />
      <ShieldForm />
      <hr />
      <TransferForm />
      <hr />
      <UnshieldForm />
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

Start the dev server:

```bash
pnpm dev
```

Open the app in your browser, connect your wallet, and try the full flow: shield some tokens, check the balance, send a confidential transfer, then unshield.

## Next steps

- [Configuration](/guides/configuration) -- customize authentication, storage backends, and network presets
- [Error Handling](/guides/handle-errors) -- handle every SDK error type
- [React Hooks](/reference/react/query-keys) -- explore all available hooks
- [Core SDK](/reference/sdk/ZamaSDK) -- use the imperative API for non-React apps
