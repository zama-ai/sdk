---
title: Encrypt & Decrypt
description: How to encrypt values and decrypt FHE ciphertext handles for custom confidential smart contracts that are not wrapped ERC-20 tokens.
---

# Encrypt & Decrypt

The high-level token hooks (`useShield`, `useConfidentialTransfer`, `useConfidentialBalance`) handle encryption and decryption automatically for wrapped confidential ERC-20 tokens. This guide is for a different scenario: **your smart contract uses FHE types directly** (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract that stores `euint` values). In that case, you need `useEncrypt` and `useUserDecryptFlow` to interact with your contract's encrypted parameters and return values.

Before starting, make sure your project is set up following the [Configuration](/guides/configuration) guide.

## Example

Here is a complete flow that encrypts a value, sends it to a custom FHE contract, reads back the encrypted handle, and decrypts it:

{% code title="ConfidentialRoundTrip.tsx" %}

```tsx
import {
  useEncrypt,
  useUserDecryptFlow,
  useUserDecryptedValue,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { bytesToHex } from "viem";
import { useState, type FormEvent } from "react";

function ConfidentialRoundTrip() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const decrypt = useUserDecryptFlow();
  const [handle, setHandle] = useState<string>();
  const { data: decryptedValue } = useUserDecryptedValue(handle);

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
    const storedHandle = (await sdk.signer.readContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "getHandle",
      args: [userAddress],
    })) as string;

    // 4. Decrypt
    await decrypt.mutateAsync({
      handles: [{ handle: storedHandle, contractAddress }],
    });

    setHandle(storedHandle);
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={encrypt.isPending || decrypt.isPending}>
        Encrypt → Store → Decrypt
      </button>
      {decryptedValue !== undefined && <output>Decrypted: {decryptedValue.toString()}</output>}
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

import { useEncrypt, useUserDecryptFlow } from "@zama-fhe/react-sdk";
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

### 3. Decrypt with useUserDecryptFlow

`useUserDecryptFlow` is the **recommended way to decrypt**. It manages the entire orchestration internally — keypair generation, EIP-712 creation, wallet signature, and decryption — so you only need to provide the handles you want to decrypt. All session parameters (`keypairTTL`, credential duration, etc.) are inherited from the SDK configuration.

{% code title="DecryptExample.tsx" %}

```tsx
import { useUserDecryptFlow, useUserDecryptedValue } from "@zama-fhe/react-sdk";

function DecryptExample() {
  const decrypt = useUserDecryptFlow();
  const { data: decryptedValue } = useUserDecryptedValue("0xabc123...");

  const handleDecrypt = async () => {
    const result = await decrypt.mutateAsync({
      handles: [
        {
          handle: "0xabc123...", // the encrypted handle from the contract
          contractAddress: "0xYourConfidentialContract",
        },
      ],
    });
    // result: { "0xabc123...": 1000n }
  };

  return (
    <section>
      <button onClick={handleDecrypt} disabled={decrypt.isPending}>
        {decrypt.isPending ? "Decrypting..." : "Decrypt"}
      </button>
      {decrypt.error && <p role="alert">Error: {decrypt.error.message}</p>}
      {decryptedValue !== undefined && <output>Value: {decryptedValue.toString()}</output>}
    </section>
  );
}
```

{% endcode %}

#### Decrypting handles from multiple contracts

`useUserDecryptFlow` automatically groups handles by contract address and issues one decryption request per contract:

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

{% hint style="info" %}
**Handles must belong to the same contract** within a single low-level `useUserDecrypt` call. The relayer requires all handles in one request to share the same contract address. `useUserDecryptFlow` handles this automatically by grouping handles. If using `useUserDecrypt` manually, group your handles by `contractAddress` and make separate calls.
{% endhint %}

#### Reading decrypted values from cache

After decryption, values are stored in React Query's cache. Use `useUserDecryptedValue` or `useUserDecryptedValues` to read them anywhere in your component tree without triggering a new decryption:

```tsx
import { useUserDecryptedValue, useUserDecryptedValues } from "@zama-fhe/react-sdk";

// Single value
function Balance({ handle }: { handle: string }) {
  const { data: value } = useUserDecryptedValue(handle);
  return <output>{value?.toString() ?? "—"}</output>;
}

// Multiple values
function Balances({ handles }: { handles: string[] }) {
  const { data } = useUserDecryptedValues(handles);
  return (
    <ul>
      {handles.map((h) => (
        <li key={h}>
          <output>{data[h]?.toString() ?? "pending"}</output>
        </li>
      ))}
    </ul>
  );
}
```

{% hint style="info" %}
**Decrypted values are `undefined`?** Cache reads only return data after a decryption has populated the cache. Make sure:

1. You have called `useUserDecryptFlow` or `useUserDecrypt` first
2. The handle you are reading matches exactly (it is case-sensitive, hex-encoded)
3. The decryption completed successfully (check `decrypt.isSuccess`)
   {% endhint %}

#### Showing progress during decryption

The decrypt flow involves a wallet signature prompt, which can feel slow. Use the callbacks to show progress:

{% code title="DecryptWithProgress.tsx" %}

```tsx
import { useUserDecryptFlow } from "@zama-fhe/react-sdk";
import { useState } from "react";

type DecryptStep = "idle" | "keypair" | "eip712" | "signing" | "decrypting" | "done";

function DecryptWithProgress() {
  const [step, setStep] = useState<DecryptStep>("idle");

  const decrypt = useUserDecryptFlow({
    callbacks: {
      onKeypairGenerated: () => setStep("eip712"),
      onEIP712Created: () => setStep("signing"),
      onSigned: () => setStep("decrypting"),
      onDecrypted: () => setStep("done"),
    },
  });

  const handleDecrypt = async () => {
    setStep("keypair");
    await decrypt.mutateAsync({
      handles: [{ handle: "0x...", contractAddress: "0xToken" }],
    });
  };

  const stepLabels: Record<DecryptStep, string> = {
    idle: "Decrypt",
    keypair: "Generating keypair...",
    eip712: "Preparing authorization...",
    signing: "Approve in wallet...",
    decrypting: "Decrypting...",
    done: "Done!",
  };

  return <button onClick={handleDecrypt}>{stepLabels[step]}</button>;
}
```

{% endcode %}

### 4. Decrypt with useUserDecrypt (advanced)

{% hint style="warning" %}
You almost certainly want `useUserDecryptFlow` instead. This low-level hook requires you to manage the FHE keypair, EIP-712 typed data, and wallet signature yourself. It exists for rare cases where you need to reuse a keypair across multiple decrypt operations or integrate with a custom signing flow.
{% endhint %}

{% code title="ManualDecrypt.tsx" %}

```tsx
import {
  useGenerateKeypair,
  useCreateEIP712,
  useUserDecrypt,
  useZamaSDK,
} from "@zama-fhe/react-sdk";

function ManualDecrypt() {
  const sdk = useZamaSDK();
  const generateKeypair = useGenerateKeypair();
  const createEIP712 = useCreateEIP712();
  const userDecrypt = useUserDecrypt();

  const handleDecrypt = async () => {
    const contractAddress = "0xYourContract";
    const handles = ["0xhandle1...", "0xhandle2..."];

    // Step 1: Generate keypair
    const keypair = await generateKeypair.mutateAsync();

    // Step 2: Create EIP-712 typed data
    const startTimestamp = Math.floor(Date.now() / 1000);
    const eip712 = await createEIP712.mutateAsync({
      publicKey: keypair.publicKey,
      contractAddresses: [contractAddress],
      startTimestamp,
      durationDays: 1,
    });

    // Step 3: Sign with wallet
    const signature = await sdk.signer.signTypedData(eip712);

    // Step 4: Decrypt
    const result = await userDecrypt.mutateAsync({
      handles,
      contractAddress,
      signedContractAddresses: [contractAddress],
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
      signature,
      signerAddress: await sdk.signer.getAddress(),
      startTimestamp,
      durationDays: 1,
    });

    // result: { "0xhandle1...": 500n, "0xhandle2...": 200n }
  };

  return <button onClick={handleDecrypt}>Decrypt (Manual)</button>;
}
```

{% endcode %}

{% hint style="info" %}
**Decryption fails with "invalid keypair" or "expired credentials"?** The FHE keypair has a TTL (default: 1 day). If the keypair was generated more than `keypairTTL` seconds ago, the relayer rejects it. The high-level hooks (`useConfidentialBalance`, `useUserDecryptFlow`) handle re-generation automatically. If using `useUserDecrypt` manually, generate a fresh keypair before each decrypt.
{% endhint %}

### 5. Decrypt with usePublicDecrypt (advanced)

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
