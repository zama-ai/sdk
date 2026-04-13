---
title: Encrypt & decrypt
description: How to encrypt values and decrypt FHE ciphertext handles for custom confidential smart contracts that are not wrapped ERC-20 tokens.
---

# Encrypt & decrypt

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
  const [handles, setHandles] = useState<{ handle: string; contractAddress: `0x${string}` }[]>([]);

  // Fires when handles are non-empty.
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

    // 3. Read the handle back — setting handles triggers decryption
    const handle = (await sdk.signer.readContract({
      address: contractAddress,
      abi: yourContractABI,
      functionName: "getHandle",
      args: [userAddress],
    })) as string;

    setHandles([{ handle, contractAddress }]);
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

### 3. Decrypt with useUserDecrypt

`useUserDecrypt` is a query hook that decrypts FHE handles. If no cached credentials exist, it triggers a wallet signature prompt. Use `useAllow` + `useIsAllowed` to pre-authorize and gate the query if you want to control when the prompt appears.

{% code title="DecryptExample.tsx" %}

```tsx
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";

const CONTRACT = "0xYourConfidentialContract" as const;

function DecryptExample() {
  const { mutate: allow, isPending: isAllowing } = useAllow();
  const { data: isAllowed } = useIsAllowed({ contractAddresses: [CONTRACT] });

  const { data, isPending } = useUserDecrypt(
    { handles: [{ handle: "0xabc123...", contractAddress: CONTRACT }] },
    { enabled: !!isAllowed },
  );

  return (
    <section>
      {!isAllowed && (
        <button onClick={() => allow([CONTRACT])} disabled={isAllowing}>
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

#### Pre-authorize once, decrypt anywhere

A common pattern is to call `useAllow` once — for example right after the user connects their wallet — and then decrypt independently in any component, on any page, without triggering another wallet prompt. Credentials persist in IndexedDB, so they survive page reloads.

{% tabs %}
{% tab title="UserDecryptionGate.tsx" %}

```tsx
import { useAllow, useIsAllowed } from "@zama-fhe/react-sdk";

/**
 * Show once after wallet connect. After the user signs,
 * every useUserDecrypt in the app works without prompts.
 *
 * Pass all contract addresses you want to decrypt upfront.
 */
function UserDecryptionGate({
  contracts,
  children,
}: {
  contracts: `0x${string}`[];
  children: React.ReactNode;
}) {
  const { mutate: allow, isPending } = useAllow();
  const { data: allowed } = useIsAllowed({
    contractAddresses: contracts,
  });

  if (allowed) return <>{children}</>;

  return (
    <button onClick={() => allow(contracts)} disabled={isPending}>
      {isPending ? "Signing..." : "Authorize decryption"}
    </button>
  );
}
```

{% endtab %}
{% tab title="ConfidentialBalance.tsx" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

/**
 * Rendered inside <UserDecryptionGate> — credentials are already cached,
 * so this fires immediately with no wallet interaction.
 */
function ConfidentialBalance({ contractAddress }: { contractAddress: `0x${string}` }) {
  const { data: balance, isPending } = useConfidentialBalance({
    tokenAddress: contractAddress,
  });

  if (isPending) return <p>Decrypting...</p>;
  return <output>{balance?.toString()}</output>;
}
```

{% endtab %}
{% tab title="App.tsx" %}

```tsx
import { useListPairs } from "@zama-fhe/react-sdk";

/**
 * Contracts can come from the on-chain wrappers registry.
 * When new pairs are added, UserDecryptionGate detects the gap
 * and shows a one-click re-authorization — the SDK extends the
 * existing credential to cover the new addresses.
 */
function App() {
  const { data: pairs } = useListPairs();
  const contracts = pairs?.items.map((p) => p.confidentialTokenAddress) ?? [];

  return (
    <UserDecryptionGate contracts={contracts}>
      {contracts.map((addr) => (
        <ConfidentialBalance key={addr} contractAddress={addr} />
      ))}
    </UserDecryptionGate>
  );
}
```

{% endtab %}
{% endtabs %}

Because `UserDecryptionGate` only renders its children after `useIsAllowed` returns `true`, every nested `useUserDecrypt` call reuses the cached credentials — no `enabled` guard needed. When new contracts appear in the list, `useIsAllowed` returns `false` and the user is prompted once to extend their authorization.

#### Decrypting handles from multiple contracts

`useUserDecrypt` automatically groups handles by contract address and issues one decryption request per contract:

```tsx
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
