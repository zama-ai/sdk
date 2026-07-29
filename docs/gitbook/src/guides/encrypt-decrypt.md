---
title: Encrypt & decrypt
description: How to encrypt values and decrypt FHE encrypted values for custom confidential smart contracts that are not wrapped ERC-20 tokens.
---

# Encrypt & decrypt

The high-level token API (`token.confidentialTransfer`, `token.balanceOf`, and the `useShield` / `useConfidentialTransfer` / `useConfidentialBalance` hooks) handles encryption and decryption automatically for wrapped confidential ERC-20 tokens. This guide is for a different scenario: **your smart contract uses FHE types directly** (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract that stores `euint` values). In that case, you encrypt inputs and decrypt outputs yourself:

- **Core SDK** — `sdk.encrypt` and `sdk.decryption.decryptValues` / `sdk.decryption.decryptPublicValues`.
- **React** — the `useEncrypt` and `useDecryptValues` / `useDecryptPublicValues` hooks.

Before starting, make sure your project is set up following the [Configuration](./configuration.md) guide.

## Example

Here is a complete flow that encrypts a value, sends it to a custom FHE contract, reads back the encrypted value, and decrypts it:

{% tabs %}
{% tab title="Core SDK" %}

{% code title="confidentialRoundTrip.ts" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK, SignerNotConfiguredError } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";

// Minimal ABI for the custom FHE contract this example reads and writes.
const yourContractABI = [
  {
    type: "function",
    name: "store",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getHandle",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

// `publicClient`, `walletClient`, and `storage` come from the Configuration guide.
const sdk = new ZamaSDK(
  createConfig({
    chains: [sepolia],
    publicClient,
    walletClient,
    storage,
    relayers: { [sepolia.id]: web() },
  }),
);

const contractAddress = "0xYourContract";
const [userAddress] = await walletClient.getAddresses();

// Writes need a signer; `sdk.signer` is `undefined` on a read-only SDK. Guarding with the
// typed error keeps it catchable via the patterns in Handle errors — unlike `!`, which
// would throw a raw, uncatchable `TypeError`.
const signer = sdk.signer;
if (!signer) throw new SignerNotConfiguredError("writeContract");

// 1. Encrypt
const { encryptedValues, inputProof } = await sdk.encrypt({
  values: [{ value: 42n, type: "euint64" }],
  contractAddress,
  userAddress,
});

// 2. Send to contract, then wait for inclusion — writeContract resolves on broadcast, so
//    reading back before the receipt lands can see a stale (zero) handle.
const txHash = await signer.writeContract({
  address: contractAddress,
  abi: yourContractABI,
  functionName: "store",
  args: [encryptedValues[0]!, inputProof],
});
await sdk.provider.waitForTransactionReceipt(txHash);

// 3. Read the encrypted value back
const encryptedValue = (await sdk.provider.readContract({
  address: contractAddress,
  abi: yourContractABI,
  functionName: "getHandle",
  args: [userAddress],
})) as `0x${string}`;

// 4. Decrypt — assembles the transport key pair + EIP-712 permit, then caches
const decrypted = await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
console.log(decrypted[encryptedValue]); // 42n
```

{% endcode %}

{% endtab %}
{% tab title="React" %}

{% code title="ConfidentialRoundTrip.tsx" %}

```tsx
import { useEncrypt, useDecryptValues, useZamaSDK } from "@zama-fhe/react-sdk";
import { SignerNotConfiguredError } from "@zama-fhe/sdk";
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

    // 2. Send to contract, then wait for inclusion. `sdk.signer` is undefined on a
    //    read-only SDK, so guard it; writeContract resolves on broadcast, so wait for
    //    the receipt before reading back or the handle can still be stale (zero).
    const signer = sdk.signer;
    if (!signer) throw new SignerNotConfiguredError("writeContract");
    const txHash = await signer.writeContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "store",
      args: [encrypted.encryptedValues[0]!, encrypted.inputProof],
    });
    await sdk.provider.waitForTransactionReceipt(txHash);

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

{% endtab %}
{% endtabs %}

{% hint style="info" %}
**Running this on a Node.js backend?** Swap the `web()` relayer for `node()` (from `@zama-fhe/sdk/node`) and drop the browser wallet client — everything else in the Core SDK flow above is identical. The [Node.js backend guide](./node-js-backend.md) walks through the setup, and [`examples/node-viem`](https://github.com/zama-ai/sdk/tree/main/examples/node-viem) / [`examples/node-ethers`](https://github.com/zama-ai/sdk/tree/main/examples/node-ethers) are runnable end-to-end versions.
{% endhint %}

{% hint style="info" %}
**Recommended: Cross-Origin headers for faster encryption**

Encryption runs FHE WASM in the browser. With `SharedArrayBuffer` available, the runtime spawns a worker pool and encrypts using multiple threads; without it, the SDK falls back to single-threaded mode (slower, but it still works — you'll see a console warning). To enable multi-threaded encryption, set these HTTP headers:

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

This applies to browser environments only. In Node.js there are no COOP/COEP headers to set; the SDK drives the FHE backend on the calling thread and spawns a worker pool for multi-threaded encryption where the environment allows (opt out process-wide with the `runtime.singleThread` option). See the [Node.js backend guide](./node-js-backend.md) and the [security model](../concepts/security-model.md#coop-coep-headers) for details.
{% endhint %}

{% hint style="warning" %}
**SSR: "window is not defined"**

FHE operations use browser APIs. In Next.js or other SSR frameworks, ensure all components using encrypt/decrypt hooks are client components:

```tsx
"use client"; // Required at the top of the file

import { useEncrypt, useDecryptValues } from "@zama-fhe/react-sdk";
```

{% endhint %}

## Steps

### 1. Encrypt values

Encrypt plaintext values into FHE ciphertext that can be passed to any smart contract function that accepts encrypted parameters (e.g. `einput` + `bytes` proof). Every call binds the encrypted values to a `contractAddress` and a `userAddress`, so pass valid addresses — not `undefined`.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { encryptedValues, inputProof } = await sdk.encrypt({
  values: [{ value: 1000n, type: "euint64" }],
  contractAddress: "0xYourConfidentialContract",
  userAddress,
});

// encryptedValues — array of `0x`-prefixed hex encrypted values, one per value (contract-ready)
// inputProof — `0x`-prefixed hex proof, required alongside the encrypted values in contract calls
```

{% endtab %}
{% tab title="React" %}

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

{% endtab %}
{% endtabs %}

#### Encrypting multiple values

Pass multiple values in a single call. Each value needs its FHE type, and they share one input proof.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { encryptedValues, inputProof } = await sdk.encrypt({
  values: [
    { value: 500n, type: "euint64" }, // amount
    { value: true, type: "ebool" }, // flag
    { value: 42n, type: "euint32" }, // parameter
  ],
  contractAddress: "0xYourContract",
  userAddress,
});

// encryptedValues[0] — encrypted 500n
// encryptedValues[1] — encrypted true
// encryptedValues[2] — encrypted 42n
// inputProof — shared proof for all encrypted values
```

{% endtab %}
{% tab title="React" %}

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

{% endtab %}
{% endtabs %}

{% hint style="info" %}
**Encryption returns empty encrypted values?** Make sure `contractAddress` and `userAddress` are valid addresses, not `undefined`. In React with wagmi, wait for the account to be connected before encrypting:

```tsx
const { address } = useAccount();

// Don't encrypt until connected
if (!address) return <p role="status">Connect wallet first</p>;
```

{% endhint %}

### 2. Use encrypted values in contract calls

After encryption, pass the encrypted values and proof to your custom FHE contract. Both are `0x`-prefixed hex, so they go straight into a `writeContract` call — no conversion needed:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// 1. Encrypt the value
const { encryptedValues, inputProof } = await sdk.encrypt({
  values: [{ value: 1000n, type: "euint64" }],
  contractAddress: "0xYourContract",
  userAddress,
});

// 2. Call your contract with the encrypted data. Guard `sdk.signer` (undefined on a
//    read-only SDK) instead of using `!`, which throws an uncatchable TypeError.
const signer = sdk.signer;
if (!signer) throw new SignerNotConfiguredError("writeContract");
await signer.writeContract({
  address: "0xYourContract",
  abi: yourContractABI,
  functionName: "yourFunction",
  args: [encryptedValues[0]!, inputProof],
});
```

{% endtab %}
{% tab title="React" %}

{% code title="ConfidentialAction.tsx" %}

```tsx
import { useEncrypt, useZamaSDK } from "@zama-fhe/react-sdk";
import { SignerNotConfiguredError } from "@zama-fhe/sdk";
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

    // 2. Call your contract with the encrypted data. Guard `sdk.signer` (undefined on a
    //    read-only SDK) instead of using `!`, which throws an uncatchable TypeError.
    const signer = sdk.signer;
    if (!signer) throw new SignerNotConfiguredError("writeContract");
    await signer.writeContract({
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

{% endtab %}
{% endtabs %}

### 3. Decryption of the encrypted data

{% hint style="info" %}
**Use the high-level decryption path.** `sdk.decryption.decryptValues` (and its React equivalent `useDecryptValues`) is the canonical way to decrypt: it assembles the decryption credentials — transport key pair and EIP-712 permit — for you, caches results, and wraps relayer errors. The low-level `sdk.relayer.decryptValuesFromPairs`, which makes you supply the transport key pair and signed permit yourself, is an escape hatch — reach for it only when you genuinely need that control.
{% endhint %}

Decrypting on-chain data requires the user to sign an EIP-712 message that grants your app a **reusable permit** for the relevant contracts. The first decryption for a set of contracts triggers this signature automatically through the configured signer.

{% tabs %}
{% tab title="Core SDK" %}

`decryptValues` groups inputs by contract address, assembles credentials (signing the EIP-712 permit through your configured signer on first use), and returns clear-text values keyed by their encrypted value:

```ts
const decrypted = await sdk.decryption.decryptValues([
  { encryptedValue: "0xvalue1...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue2...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue3...", contractAddress: "0xTokenB" },
]);

// decrypted: { "0xvalue1...": 500n, "0xvalue2...": 200n, "0xvalue3...": 1000n }
```

On a backend signer (a local private key), the permit is signed silently. In a browser, the first call surfaces a wallet prompt — trigger it from an explicit user action, not on load. Reuse the same `sdk` instance so cached permits and decrypted values persist across calls.

{% endtab %}
{% tab title="React" %}

Hooks like `useDecryptValues` and `useConfidentialBalance` trigger the permit signature automatically the first time they run. If your app calls these hooks on render without gating, users see an unsolicited wallet popup before they have taken any action — a confusing experience that often leads to rejection.

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

This causes an unexpected wallet popup, user rejection, potential Blockaid flags, and loss of trust.
{% endhint %}

{% endtab %}
{% endtabs %}

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

Both `sdk.decryption.decryptValues` and `useDecryptValues` automatically group inputs by contract address and issue one decryption request per contract:

```tsx
const { data } = useDecryptValues([
  { encryptedValue: "0xvalue1...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue2...", contractAddress: "0xTokenA" },
  { encryptedValue: "0xvalue3...", contractAddress: "0xTokenB" },
]);

// data: { "0xvalue1...": 500n, "0xvalue2...": 200n, "0xvalue3...": 1000n }
```

#### Persistent caching

Decrypted values are stored through the SDK's internal CachingService, scoped by signer and contract address. Cached values survive page reloads — `decryptValues` returns them instantly without hitting the relayer.

The cache is cleared on `permits.revokePermits()`, `permits.clear()`, or wallet lifecycle events (disconnect, account/chain change).

{% hint style="info" %}
**Decryption fails with an invalid or expired transport key pair?** The transport key pair has a TTL (default: 30 days). If the key pair was generated more than `transportKeyPairTTL` seconds ago, the relayer rejects it. Grant a fresh permit again (`sdk.permits.grantPermit` / `useGrantPermit`) to generate a new transport key pair and permits.
{% endhint %}

### 4. Decrypt public values (advanced)

For values marked as publicly decryptable on-chain, no transport key pair or signature is needed — this path works even without a configured signer:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { clearValues } = await sdk.decryption.decryptPublicValues(["0xEncryptedValue..."]);
// clearValues: { "0xEncryptedValue...": 1000n }
```

`decryptPublicValues` also returns `decryptionProof` and `abiEncodedClearValues` alongside `clearValues`, so you can submit on-chain finalization transactions that verify the decryption.

{% endtab %}
{% tab title="React" %}

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

{% endtab %}
{% endtabs %}

## Next steps

- [Node.js backend](./node-js-backend.md) — run the core SDK server-side with per-request storage isolation
- [ZamaSDK reference](../reference/sdk/ZamaSDK.md) — `encrypt`, `decryption`, and the full core API
- [Decrypt values from event logs](./decrypt-from-event-logs.md) — index confidential transfers and decrypt amounts off event logs
- [Configuration](./configuration.md) — chains, relayers, authentication, and permit management
