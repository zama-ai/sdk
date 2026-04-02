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
import { useEncrypt, useUserDecrypt, useZamaSDK } from "@zama-fhe/react-sdk";
import { bytesToHex } from "viem";
import { useState, type FormEvent } from "react";

function ConfidentialRoundTrip() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const [storedHandle, setStoredHandle] = useState<string>();
  const decrypt = useUserDecrypt();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const userAddress = await sdk.signer.getAddress();
    const contractAddress = "0xYourContract";

    // 1. Encrypt
    const encrypted = await encrypt.mutateAsync({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress,
      userAddress,
    });

    // 2. Send to contract
    const txHash = await sdk.signer.writeContract({
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

    setStoredHandle(handle);

    // 4. Decrypt
    const result = await decrypt.mutateAsync({
      handles: [{ handle, contractAddress }],
    });
    // result: { "0xhandle...": 42n }
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={encrypt.isPending || decrypt.isPending}>
        Encrypt → Store → Decrypt
      </button>
      {decrypt.data && storedHandle && (
        <output>Decrypted: {decrypt.data[storedHandle]?.toString()}</output>
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

### 3. Decrypt with useUserDecrypt

`useUserDecrypt` manages the entire orchestration internally — keypair generation, EIP-712 creation, wallet signature, and decryption — so you only need to provide the handles you want to decrypt. All session parameters (`keypairTTL`, credential duration, etc.) are inherited from the SDK configuration.

{% code title="DecryptExample.tsx" %}

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";

function DecryptExample() {
  const decrypt = useUserDecrypt({
    handles: [
      {
        handle: "0xabc123...",
        contractAddress: "0xYourConfidentialContract",
      },
    ],
  });

  const handleDecrypt = async () => {
    // Decrypts only uncached handles; returns cached values if already decrypted
    const result = await decrypt.mutateAsync();
    // result: { "0xabc123...": 1000n }
  };

  return (
    <section>
      <button onClick={handleDecrypt} disabled={decrypt.isPending}>
        {decrypt.isPending ? "Decrypting..." : "Decrypt"}
      </button>
      {decrypt.error && <p role="alert">Error: {decrypt.error.message}</p>}
      {decrypt.data && <output>Value: {Object.values(decrypt.data)[0]?.toString()}</output>}
    </section>
  );
}
```

{% endcode %}

#### Decrypting handles from multiple contracts

`useUserDecrypt` automatically groups handles by contract address and issues one decryption request per contract:

```tsx
const result = await decrypt.mutateAsync({
  handles: [
    { handle: "0xhandle1...", contractAddress: "0xTokenA" },
    { handle: "0xhandle2...", contractAddress: "0xTokenA" },
    { handle: "0xhandle3...", contractAddress: "0xTokenB" },
  ],
});

// Single wallet signature, but two decryption requests (one per contract)
// result: { "0xhandle1...": 500n, "0xhandle2...": 200n, "0xhandle3...": 1000n }
```

#### Reading decrypted values

Decrypted values are returned in `data` and also stored in the SDK's in-memory cache (`sdk.cache`). Pass `handles` to config and call `mutate()` — cached handles are returned instantly without hitting the relayer:

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";
import type { DecryptHandle } from "@zama-fhe/react-sdk";

function DecryptedBalances({ handles }: { handles: DecryptHandle[] }) {
  const { data, mutate, isPending } = useUserDecrypt({ handles });

  return (
    <section>
      <button onClick={() => mutate()} disabled={isPending}>
        {isPending ? "Decrypting..." : "Decrypt"}
      </button>
      {data && (
        <ul>
          {handles.map((h) => (
            <li key={h.handle}>
              <output>{data[h.handle]?.toString() ?? "pending"}</output>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Calling `mutate()` without arguments decrypts only handles not already in the SDK cache. If all handles are cached, the cached values are returned immediately without a relayer call.

#### Showing progress during decryption

Use the `onCredentialsReady` and `onDecrypted` callbacks to show progress:

{% code title="DecryptWithProgress.tsx" %}

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";
import { useState } from "react";

type DecryptStep = "idle" | "authorizing" | "decrypting" | "done";

function DecryptWithProgress() {
  const [step, setStep] = useState<DecryptStep>("idle");

  const decrypt = useUserDecrypt({
    onCredentialsReady: () => setStep("decrypting"),
    onDecrypted: () => setStep("done"),
  });

  const handleDecrypt = async () => {
    setStep("authorizing");
    await decrypt.mutateAsync({
      handles: [{ handle: "0x...", contractAddress: "0xToken" }],
    });
  };

  const stepLabels: Record<DecryptStep, string> = {
    idle: "Decrypt",
    authorizing: "Authorizing...",
    decrypting: "Decrypting...",
    done: "Done!",
  };

  return <button onClick={handleDecrypt}>{stepLabels[step]}</button>;
}
```

{% endcode %}

{% hint style="info" %}
**Decryption fails with "invalid keypair" or "expired credentials"?** The FHE keypair has a TTL (default: 30 days). If the keypair was generated more than `keypairTTL` seconds ago, the relayer rejects it. `useUserDecrypt` and `useConfidentialBalance` handle re-generation automatically.
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
