# Encryption & Decryption

This guide covers how to encrypt values for smart contract calls and decrypt FHE ciphertext handles using the React SDK hooks. If you're using the high-level token hooks (`useShield`, `useConfidentialTransfer`, `useConfidentialBalance`), encryption and decryption are handled automatically — you don't need this guide. This is for custom flows where you need direct FHE control.

## Encryption with `useEncrypt`

`useEncrypt` encrypts plaintext values into FHE ciphertext handles that can be passed to confidential smart contract functions.

### Basic usage

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

### Encrypting multiple values

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

### Supported FHE types

| Type       | JS value type       | Range                 |
| ---------- | ------------------- | --------------------- |
| `ebool`    | `boolean \| bigint` | `true`/`false` or 0/1 |
| `euint8`   | `bigint`            | 0–255                 |
| `euint16`  | `bigint`            | 0–65535               |
| `euint32`  | `bigint`            | 0–2³²−1               |
| `euint64`  | `bigint`            | 0–2⁶⁴−1               |
| `euint128` | `bigint`            | 0–2¹²⁸−1              |
| `euint256` | `bigint`            | 0–2²⁵⁶−1              |
| `eaddress` | `` `0x${string}` `` | Ethereum address      |

### Using encrypted values in contract calls

After encryption, pass the handles and proof to your contract:

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

## Decryption

The SDK provides three levels of decryption hooks, from simplest to most flexible.

### Option 1: `useUserDecryptFlow` (recommended)

This is the **recommended hook** for most use cases. It handles the complete 4-step orchestration in a single call:

1. Generate an FHE keypair
2. Create EIP-712 typed data for authorization
3. Prompt the wallet to sign
4. Decrypt the ciphertext handles

```tsx
import { useUserDecryptFlow } from "@zama-fhe/react-sdk";
import type { DecryptHandle } from "@zama-fhe/react-sdk";
import { useState } from "react";

function DecryptExample() {
  const [status, setStatus] = useState("idle");
  const decrypt = useUserDecryptFlow({
    callbacks: {
      onKeypairGenerated: () => setStatus("Keypair ready"),
      onEIP712Created: () => setStatus("Awaiting wallet signature..."),
      onSigned: () => setStatus("Signed, decrypting..."),
      onDecrypted: () => setStatus("Done!"),
    },
  });

  const handleDecrypt = async () => {
    const handles: DecryptHandle[] = [
      {
        handle: "0xabc123...", // the encrypted handle from the contract
        contractAddress: "0xYourConfidentialContract",
      },
    ];

    const result = await decrypt.mutateAsync({
      handles,
      durationDays: 1, // credential validity (default: 1 day)
    });

    // result is Record<Handle, ClearValueType>
    // e.g. { "0xabc123...": 1000n }
  };

  return (
    <div>
      <button onClick={handleDecrypt} disabled={decrypt.isPending}>
        {decrypt.isPending ? "Decrypting..." : "Decrypt Balance"}
      </button>
      {decrypt.error && <p>Error: {decrypt.error.message}</p>}
      {status !== "idle" && <p>{status}</p>}
    </div>
  );
}
```

### Decrypting handles from multiple contracts

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

### Reading decrypted values from cache

After decryption, values are stored in React Query's cache. Use `useUserDecryptedValue` or `useUserDecryptedValues` to read them anywhere in your component tree without triggering a new decryption:

```tsx
import { useUserDecryptedValue, useUserDecryptedValues } from "@zama-fhe/react-sdk";

// Single value
function Balance({ handle }: { handle: string }) {
  const { data: value } = useUserDecryptedValue(handle);
  return <span>{value?.toString() ?? "—"}</span>;
}

// Multiple values
function Balances({ handles }: { handles: string[] }) {
  const { data } = useUserDecryptedValues(handles);
  return (
    <ul>
      {handles.map((h) => (
        <li key={h}>{data[h]?.toString() ?? "pending"}</li>
      ))}
    </ul>
  );
}
```

### Option 2: `useUserDecrypt` (manual orchestration)

Use this when you need full control over each step — for example, to reuse a keypair across multiple decrypt operations or integrate with a custom signing flow.

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

### Option 3: `usePublicDecrypt` (no authorization needed)

For values marked as publicly decryptable on-chain, no keypair or signature is needed:

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

## Full example: encrypt, send, decrypt

Here's a complete flow that encrypts a value, sends it to a contract, reads back the encrypted handle, and decrypts it:

```tsx
import {
  useEncrypt,
  useUserDecryptFlow,
  useUserDecryptedValue,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { bytesToHex } from "viem";
import { useState } from "react";

function ConfidentialRoundTrip() {
  const sdk = useZamaSDK();
  const encrypt = useEncrypt();
  const decrypt = useUserDecryptFlow();
  const [handle, setHandle] = useState<string>();
  const { data: decryptedValue } = useUserDecryptedValue(handle);

  const handleSubmit = async () => {
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
    <div>
      <button onClick={handleSubmit} disabled={encrypt.isPending || decrypt.isPending}>
        Encrypt → Store → Decrypt
      </button>
      {decryptedValue !== undefined && <p>Decrypted: {decryptedValue.toString()}</p>}
    </div>
  );
}
```

## Showing progress during decryption

The decrypt flow involves a wallet signature prompt, which can feel slow. Use the callbacks to show progress:

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

## Common pitfalls

### "Cannot find WASM module" or blank screen on load

`RelayerWeb` loads FHE WASM from a CDN in a Web Worker. This requires specific HTTP headers for `SharedArrayBuffer`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Next.js** — add to `next.config.js`:

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

**Vite** — add the `vite-plugin-cross-origin-isolation` plugin or set headers in `vite.config.ts`:

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

### "useZamaSDK must be used within a ZamaProvider"

All encrypt/decrypt hooks require a `ZamaProvider` ancestor in the component tree. Make sure your component is rendered inside:

```tsx
<QueryClientProvider client={queryClient}>
  <ZamaProvider relayer={relayer} signer={signer} storage={storage}>
    <YourComponent /> {/* hooks work here */}
  </ZamaProvider>
</QueryClientProvider>
```

### Encryption returns empty handles

Make sure `contractAddress` and `userAddress` are valid addresses, not `undefined`. If using wagmi, wait for the account to be connected:

```tsx
const { address } = useAccount();

// Don't encrypt until connected
if (!address) return <p>Connect wallet first</p>;
```

### Decryption fails with "invalid keypair" or "expired credentials"

The FHE keypair has a TTL (default: 1 day). If the keypair was generated more than `keypairTTL` seconds ago, the relayer rejects it. The high-level hooks (`useConfidentialBalance`, `useUserDecryptFlow`) handle re-generation automatically. If using `useUserDecrypt` manually, generate a fresh keypair before each decrypt.

### Wallet signature prompt appears repeatedly

The SDK caches the session signature in memory by default, so it's lost on page reload. To reduce prompts:

1. **Pre-authorize tokens** with `useAllow` on app load
2. **Increase `sessionTTL`** in `ZamaProvider` (default: 30 days)
3. **Use `indexedDBStorage`** for credential persistence across reloads (the encrypted keypair is stored; only the session signature needs re-signing)

### Decrypted values are `undefined` in `useUserDecryptedValue`

Cache reads only return data after a decryption has populated the cache. Make sure:

1. You've called `useUserDecryptFlow` or `useUserDecrypt` first
2. The handle you're reading matches exactly (it's case-sensitive, hex-encoded)
3. The decryption completed successfully (check `decrypt.isSuccess`)

### Error: "handles must belong to the same contract"

The relayer requires all handles in a single `userDecrypt` call to belong to the same contract. `useUserDecryptFlow` handles this automatically by grouping handles. If using `useUserDecrypt` manually, group your handles by `contractAddress` and make separate calls.

### SSR / "window is not defined"

FHE operations use Web Workers and browser APIs. In Next.js or other SSR frameworks, ensure all components using encrypt/decrypt hooks are client components:

```tsx
"use client"; // Required at the top of the file

import { useEncrypt, useUserDecryptFlow } from "@zama-fhe/react-sdk";
```
