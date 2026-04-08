---
title: Encrypt & Decrypt
description: How to encrypt values and decrypt FHE ciphertext handles for custom confidential smart contracts that are not wrapped ERC-20 tokens.
---

# Encrypt & Decrypt

The high-level token hooks (`useShield`, `useConfidentialTransfer`, `useConfidentialBalance`) handle encryption and decryption automatically for wrapped confidential ERC-20 tokens. This guide is for a different scenario: **your smart contract uses FHE types directly** (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract that stores `euint` values). In that case, you need `useEncrypt` and `useUserDecrypt` to interact with your contract's encrypted parameters and return values.

Before starting, make sure your project is set up following the [Configuration](/guides/configuration) guide.

## Example

Here is a complete flow that encrypts a value, sends it to a custom FHE contract, reads back the encrypted handle, and decrypts it:

{% code title="ConfidentialRoundTrip.tsx" %}

```tsx
import { useAllow, useEncrypt, useUserDecrypt, useZamaSDK } from "@zama-fhe/react-sdk";
import { bytesToHex } from "viem";
import { useState, type FormEvent } from "react";

function ConfidentialRoundTrip() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const { mutate: allow } = useAllow();
  const [handles, setHandles] = useState<{ handle: string; contractAddress: `0x${string}` }[]>([]);

  // useUserDecrypt fires automatically once allow() is called
  const { data: decrypted } = useUserDecrypt({ handles });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const userAddress = await sdk.signer.getAddress();
    const contractAddress = "0xYourContract" as `0x${string}`;

    // 1. Encrypt
    const encrypted = await encrypt.mutateAsync({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress,
      userAddress,
    });

    // 2. Send to contract
    await sdk.signer.writeContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "store",
      args: [bytesToHex(encrypted.handles[0]!), bytesToHex(encrypted.inputProof)],
    });

    // 3. Read the handle back from the contract
    const handle = (await sdk.signer.readContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "getHandle",
      args: [userAddress],
    })) as string;

    // 4. Set handles and authorize — decryption happens automatically
    setHandles([{ handle, contractAddress }]);
    allow([contractAddress]);
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={encrypt.isPending}>
        Encrypt → Store → Decrypt
      </button>
      {decrypted && handles[0] && (
        <output>Decrypted: {decrypted[handles[0].handle]?.toString()}</output>
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

See [Configuration](/guides/configuration) for full setup instructions.
{% endhint %}

{% hint style="warning" %}
**SSR: "window is not defined"**

FHE operations use Web Workers and browser APIs. In Next.js or other SSR frameworks, ensure all components using encrypt/decrypt hooks are client components:

```tsx
"use client"; // Required at the top of the file

import { useEncrypt, useUserDecrypt } from "@zama-fhe/react-sdk";
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

    // result.handles — array of Uint8Array, one per value
    // result.inputProof — Uint8Array, required alongside handles in contract calls
    // Use handles and inputProof in your contract call (see next section)
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

// result.handles[0] — encrypted 500n
// result.handles[1] — encrypted true
// result.handles[2] — encrypted 42n
// result.inputProof — shared proof for all handles
```

{% hint style="info" %}
**Encryption returns empty handles?** Make sure `contractAddress` and `userAddress` are valid addresses, not `undefined`. If using wagmi, wait for the account to be connected:

```tsx
const { address } = useAccount();

// Don't encrypt until connected
if (!address) return <p role="status">Connect wallet first</p>;
```

{% endhint %}

### 2. Use encrypted values in contract calls

After encryption, pass the handles and proof to your custom FHE contract:

{% code title="ConfidentialAction.tsx" %}

```tsx
import { useEncrypt, useZamaSDK } from "@zama-fhe/react-sdk";
import { bytesToHex } from "viem";

function ConfidentialAction() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();

  const handleAction = async () => {
    // 1. Encrypt the value
    const { handles, inputProof } = await encrypt.mutateAsync({
      values: [{ value: 1000n, type: "euint64" }],
      contractAddress: "0xYourContract",
      userAddress: await sdk.signer.getAddress(),
    });

    // 2. Call your contract with the encrypted data
    await sdk.signer.writeContract({
      address: "0xYourContract",
      abi: yourContractABI,
      functionName: "yourFunction",
      args: [bytesToHex(handles[0]!), bytesToHex(inputProof)],
    });
  };

  return <button onClick={handleAction}>Submit</button>;
}
```

{% endcode %}

### 3. Authorize and decrypt with useAllow + useUserDecrypt

Decryption is a two-step process:

1. **`useAllow`** — signs an EIP-712 message authorizing decryption for specific contracts (triggers a wallet prompt once).
2. **`useUserDecrypt`** — a query that automatically decrypts handles once credentials are available. No manual `mutate()` call needed.

{% code title="DecryptExample.tsx" %}

```tsx
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";

function DecryptExample() {
  const { mutate: allow, isPending: isAllowing } = useAllow();
  const { data: isAllowed } = useIsAllowed();

  const { data, isPending } = useUserDecrypt({
    handles: [
      {
        handle: "0xabc123...",
        contractAddress: "0xYourConfidentialContract",
      },
    ],
  });

  return (
    <section>
      {!isAllowed && (
        <button onClick={() => allow(["0xYourConfidentialContract"])} disabled={isAllowing}>
          {isAllowing ? "Signing..." : "Authorize decryption"}
        </button>
      )}
      {isPending && <p>Decrypting...</p>}
      {data && <output>Value: {Object.values(data)[0]?.toString()}</output>}
    </section>
  );
}
```

{% endcode %}

#### Decrypting handles from multiple contracts

`useUserDecrypt` automatically groups handles by contract address and issues one decryption request per contract. Make sure all contracts are authorized via `useAllow`:

```tsx
// Authorize all contracts upfront
allow(["0xTokenA", "0xTokenB"]);

// useUserDecrypt fires once credentials cover both contracts
const { data } = useUserDecrypt({
  handles: [
    { handle: "0xhandle1...", contractAddress: "0xTokenA" },
    { handle: "0xhandle2...", contractAddress: "0xTokenA" },
    { handle: "0xhandle3...", contractAddress: "0xTokenB" },
  ],
});

// data: { "0xhandle1...": 500n, "0xhandle2...": 200n, "0xhandle3...": 1000n }
```

#### Persistent caching

Decrypted values are stored in the SDK's persistent decrypt cache (`sdk.cache`), scoped by signer and contract address. Cached values survive page reloads — `useUserDecrypt` returns them instantly without hitting the relayer.

The cache is cleared on `revoke()`, `revokeSession()`, or wallet lifecycle events (disconnect, account/chain change).

{% hint style="info" %}
**Decryption fails with "invalid keypair" or "expired credentials"?** The FHE keypair has a TTL (default: 30 days). If the keypair was generated more than `keypairTTL` seconds ago, the relayer rejects it. Call `useAllow` again to generate fresh credentials.
{% endhint %}

### 4. Decrypt with usePublicDecrypt (advanced)

For values marked as publicly decryptable on-chain, no keypair or signature is needed:

{% code title="PublicDecryptExample.tsx" %}

```tsx
import { usePublicDecrypt } from "@zama-fhe/react-sdk";

function PublicDecryptExample() {
  const publicDecrypt = usePublicDecrypt();

  const handleDecrypt = async () => {
    const result = await publicDecrypt.mutateAsync(["0xhandle..."]);
    // result.clearValues: { "0xhandle...": 1000n }
  };

  return <button onClick={handleDecrypt}>Public Decrypt</button>;
}
```

{% endcode %}
