---
title: Encrypt & decrypt
description: How to encrypt values and decrypt FHE encrypted values for custom confidential smart contracts that are not wrapped ERC-20 tokens.
---

# Encrypt & decrypt

The high-level token hooks (`useShield`, `useConfidentialTransfer`, `useConfidentialBalance`) handle encryption and decryption automatically for wrapped confidential ERC-20 tokens. This guide is for a different scenario: **your smart contract uses FHE types directly** (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract that stores `euint` values). In that case, you need `useEncrypt` and `useDecryptValues` to interact with your contract's encrypted parameters and return values.

Before starting, make sure your project is set up following the [Configuration](./configuration.md) guide.

## Example

Here is a complete flow that encrypts a value, sends it to a custom FHE contract, reads back the encrypted value, and decrypts it:

{% code title="ConfidentialRoundTrip.tsx" %}

```tsx
import { useEncrypt, useDecryptValues, useZamaSDK } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { useState, type FormEvent } from "react";

function ConfidentialRoundTrip() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const { address: userAddress } = useAccount();
  const [inputs, setInputs] = useState<
    { encryptedValue: string; contractAddress: `0x${string}` }[]
  >([]);

  // Disabled by default — opt in with `enabled`. The hook still waits for
  // non-empty inputs and a connected wallet before it decrypts.
  const { data: decrypted } = useDecryptValues(inputs, { enabled: true });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const contractAddress = "0xYourContract" as `0x${string}`;

    // 1. Encrypt
    const encrypted = await encrypt.mutateAsync({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress,
      userAddress: userAddress!,
    });

    // 2. Send to contract
    await sdk.signer!.writeContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "store",
      args: [encrypted.encryptedValues[0]!, encrypted.inputProof],
    });

    // 3. Read the encrypted value back — setting inputs triggers decryption
    const encryptedValue = (await sdk.provider.readContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "getHandle",
      args: [userAddress],
    })) as string;

    setInputs([{ encryptedValue, contractAddress }]);
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={encrypt.isPending}>
        Encrypt → Store → Decrypt
      </button>
      {decrypted && inputs[0] && (
        <output>Decrypted: {decrypted[inputs[0].encryptedValue]?.toString()}</output>
      )}
    </form>
  );
}
```

{% endcode %}

{% hint style="warning" %}
**Required: Cross-Origin headers**

`useEncrypt` loads FHE WASM in a Web Worker, which requires `SharedArrayBuffer`. You must set these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

{% tabs %}
{% tab title="Next.js" %}

```js
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};
```

{% endtab %}
{% tab title="Vite" %}

```ts
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

{% endtab %}
{% endtabs %}

See [Configuration](./configuration.md) for full setup instructions.
{% endhint %}

{% hint style="warning" %}
**SSR: "window is not defined"**

FHE operations use Web Workers and browser APIs. In Next.js or other SSR frameworks, ensure all components using encrypt/decrypt hooks are client components:

```tsx
"use client"; // Required at the top of the file

import { useEncrypt, useDecryptValues } from "@zama-fhe/react-sdk";
```

{% endhint %}

## Steps

### 1. Encrypt values with useEncrypt

`useEncrypt` encrypts plaintext values into FHE ciphertext that can be passed to any smart contract function that accepts encrypted parameters (e.g. `einput` + `bytes` proof).

{% code title="EncryptExample.tsx" %}

```tsx
import { useEncrypt } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

function EncryptExample() {
  const encrypt = useEncrypt();
  const { address: userAddress } = useAccount();

  const handleEncrypt = async () => {
    const result = await encrypt.mutateAsync({
      values: [{ value: 1000n, type: "euint64" }],
      contractAddress: "0xYourConfidentialContract",
      userAddress: userAddress!,
    });

    // result.encryptedValues — array of `0x`-prefixed hex encrypted values, one per value (contract-ready)
    // result.inputProof — `0x`-prefixed hex proof, required alongside the encrypted values in contract calls
    // Use encryptedValues and inputProof in your contract call (see next section)
  };

  return (
    <button onClick={handleEncrypt} disabled={encrypt.isPending}>
      {encrypt.isPending ? "Encrypting..." : "Encrypt"}
    </button>
  );
}
```

{% endcode %}

#### Encrypting multiple values

Pass multiple values in a single call. Each value needs its FHE type.

```tsx
const result = await encrypt.mutateAsync({
  values: [
    { value: 500n, type: "euint64" }, // amount
    { value: true, type: "ebool" }, // flag
    { value: 42n, type: "euint32" }, // parameter
  ],
  contractAddress: "0xYourContract",
  userAddress,
});

// result.encryptedValues[0] — encrypted 500n
// result.encryptedValues[1] — encrypted true
// result.encryptedValues[2] — encrypted 42n
// result.inputProof — shared proof for all encrypted values
```

{% hint style="info" %}
**Encryption returns empty encrypted values?** Make sure `contractAddress` and `userAddress` are valid addresses, not `undefined`. If using wagmi, wait for the account to be connected:

```tsx
const { address } = useAccount();

// Don't encrypt until connected
if (!address) return <p role="status">Connect wallet first</p>;
```

{% endhint %}

### 2. Use encrypted values in contract calls

After encryption, pass the encrypted values and proof to your custom FHE contract. Both are `0x`-prefixed hex, so they go straight into a `writeContract` call — no conversion needed:

{% code title="ConfidentialAction.tsx" %}

```tsx
import { useEncrypt, useZamaSDK } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

function ConfidentialAction() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const { address } = useAccount();

  const handleAction = async () => {
    // 1. Encrypt the value
    const { encryptedValues, inputProof } = await encrypt.mutateAsync({
      values: [{ value: 1000n, type: "euint64" }],
      contractAddress: "0xYourContract",
      userAddress: address!,
    });

    // 2. Call your contract with the encrypted data
    await sdk.signer!.writeContract({
      address: "0xYourContract",
      abi: yourContractABI,
      functionName: "yourFunction",
      args: [encryptedValues[0]!, inputProof],
    });
  };

  return <button onClick={handleAction}>Submit</button>;
}
```

{% endcode %}

### 3. Decryption of the encrypted data

Decrypting on-chain data requires the user to sign an EIP-712 message that grants your app a **reusable permit** for the relevant contracts. Hooks like `useDecryptValues` and `useConfidentialBalance` trigger this signature automatically the first time they run. If your app calls these hooks on render without gating, users see an unsolicited MetaMask popup before they have taken any action — a confusing experience that often leads to rejection.

A good decryption UX follows three steps:

1. **Check permits** — use `useHasPermit` to see whether the user has already signed.
2. **Show a locked state** — display a clear "Decrypt" button so the user understands what they are authorizing.
3. **Decrypt on demand** — only mount balance or decrypt components after permits exist.

{% hint style="danger" %}
**Never** call `useConfidentialBalance` or `useDecryptValues` without gating on `useHasPermit`:

```tsx
// BAD — triggers wallet popup as soon as the component mounts
function BadExample({ tokenAddress }: { tokenAddress: Address }) {
  const balance = useConfidentialBalance({ address: tokenAddress });
  return <p>{balance.data?.toString()}</p>;
}
```

This causes an unexpected MetaMask popup, user rejection, potential Blockaid flags, and loss of trust.
{% endhint %}

#### Gating useConfidentialBalance

Split the gate and the balance display into separate components. The gate checks credentials and shows a decrypt button; the balance component only mounts once credentials exist, so it never triggers a wallet popup.

{% tabs %}
{% tab title="DecryptGate.tsx" %}

```tsx
import { useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

function DecryptGate({
  contractAddresses,
  children,
}: {
  contractAddresses: Address[];
  children: React.ReactNode;
}) {
  const { data: hasPermit } = useHasPermit({ contractAddresses });
  const { mutate: grantPermit, isPending } = useGrantPermit();

  if (hasPermit) return <>{children}</>;

  return (
    <button onClick={() => grantPermit(contractAddresses)} disabled={isPending}>
      {isPending ? "Signing..." : "Decrypt Balances"}
    </button>
  );
}
```

{% endtab %}
{% tab title="ConfidentialBalance.tsx" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";

function ConfidentialBalance({
  tokenAddress,
  decimals,
  symbol,
}: {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
}) {
  const { address } = useAccount();
  const { data, isLoading } = useConfidentialBalance({ address: tokenAddress, account: address });

  return (
    <p>
      {symbol}: {isLoading ? "Decrypting..." : formatUnits(data ?? 0n, decimals)}
    </p>
  );
}
```

{% endtab %}
{% tab title="App.tsx" %}

```tsx
function App() {
  const tokens = [
    { address: "0xTokenA" as const, decimals: 6, symbol: "USDC" },
    { address: "0xTokenB" as const, decimals: 18, symbol: "WETH" },
  ];

  return (
    <DecryptGate contractAddresses={tokens.map((t) => t.address)}>
      {tokens.map((t) => (
        <ConfidentialBalance
          key={t.address}
          tokenAddress={t.address}
          decimals={t.decimals}
          symbol={t.symbol}
        />
      ))}
    </DecryptGate>
  );
}
```

{% endtab %}
{% endtabs %}

`DecryptGate` only renders its children once `useHasPermit` returns true. This means `ConfidentialBalance` never mounts without permits — no `enabled` guard needed, no wallet popup on render. Returning users skip the prompt entirely because permits persist in IndexedDB (default TTL: 30 days).

The same pattern works with `useDecryptValues` and any other decrypt hook — anything nested inside `DecryptGate` can decrypt freely without triggering a wallet prompt.

When contract addresses come from the chain (e.g. `useListPairs`), `DecryptGate` automatically detects new addresses and prompts the user once to extend their authorization:

```tsx
import { useListPairs } from "@zama-fhe/react-sdk";

function App() {
  const { data: pairs } = useListPairs({ metadata: true });
  const addresses = pairs?.items.map((p) => p.confidentialTokenAddress) ?? [];

  return (
    <DecryptGate contractAddresses={addresses}>
      {pairs?.items.map((p) => (
        <ConfidentialBalance
          key={p.confidentialTokenAddress}
          tokenAddress={p.confidentialTokenAddress}
          decimals={p.confidential.decimals}
          symbol={p.confidential.symbol}
        />
      ))}
    </DecryptGate>
  );
}
```

#### Decrypting encrypted values from multiple contracts

`useDecryptValues` automatically groups inputs by contract address and issues one decryption request per contract:

```tsx
const { data } = useDecryptValues([
  { encryptedValue: "0xvalue1...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue2...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue3...", contractAddress: "0xTokenB" },
]);

// data: { "0xvalue1...": 500n, "0xvalue2...": 200n, "0xvalue3...": 1000n }
```

#### Persistent caching

Decrypted values are stored through the SDK's internal CachingService, scoped by signer and contract address. Cached values survive page reloads — `useDecryptValues` returns them instantly without hitting the relayer.

The cache is cleared on `permits.revokePermits()`, `permits.clear()`, or wallet lifecycle events (disconnect, account/chain change).

{% hint style="info" %}
**Decryption fails with an invalid or expired transport key pair?** The transport key pair has a TTL (default: 30 days). If the key pair was generated more than `transportKeyPairTTL` seconds ago, the relayer rejects it. Call `useGrantPermit` again to generate a fresh transport key pair and permits.
{% endhint %}

### 4. Decrypt with useDecryptPublicValues (advanced)

For values marked as publicly decryptable on-chain, no transport key pair or signature is needed:

{% code title="PublicDecryptExample.tsx" %}

```tsx
import { useDecryptPublicValues } from "@zama-fhe/react-sdk";

function PublicDecryptExample() {
  const decryptPublicValues = useDecryptPublicValues();

  const handleDecrypt = async () => {
    const result = await decryptPublicValues.mutateAsync(["0xEncryptedValue..."]);
    // result.clearValues: { "0xEncryptedValue...": 1000n }
  };

  return <button onClick={handleDecrypt}>Public Decrypt</button>;
}
```

{% endcode %}
