---
title: useUserDecrypt
description: High-level mutation hook that orchestrates the full user decryption flow — credential management, wallet signature, and decryption — in a single call.
---

# useUserDecrypt

High-level orchestration hook for user decryption. Manages the entire flow internally — keypair generation, EIP-712 creation, wallet signature, and decryption — so you only need to provide the handles you want to decrypt. All session parameters (`keypairTTL`, credential duration, etc.) are inherited from the SDK configuration.

Reuses cached FHE credentials when available, falling back to generating fresh ones only when no valid credentials exist. This avoids redundant wallet signature prompts across multiple decrypt calls.

{% hint style="info" %}
**This is the recommended way to decrypt.** For token balances, prefer [`useConfidentialBalance`](/reference/react/useConfidentialBalance) which decrypts automatically with two-phase polling. Use `useUserDecrypt` when your smart contract uses FHE types directly (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract).
{% endhint %}

## Import

```ts
import { useUserDecrypt } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";

function DecryptHandle() {
  const decrypt = useUserDecrypt({
    handles: [
      {
        handle: "0xhandle...",
        contractAddress: "0xYourContract",
      },
    ],
  });

  async function handleDecrypt() {
    // Decrypts only uncached handles; no-op if already cached
    const result = await decrypt.mutateAsync();
    // result: { "0xhandle...": 1000n }
  }

  const decryptedValue = decrypt.values["0xhandle..."];

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

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseUserDecryptConfig } from "@zama-fhe/react-sdk";
```

`UseUserDecryptConfig` extends `UserDecryptOptions` — options and tracked handles are passed directly as top-level properties.

### handles

`DecryptHandle[] | undefined`

Encrypted handles to track. The hook reactively reads their decrypted values from the cache via the `values` map. When you call `mutate()` without arguments, only handles not yet in the cache are sent for decryption.

### onCredentialsReady

`(() => void) | undefined`

Fired after credentials are ready — either reused from cache or freshly generated (which may trigger a wallet signature prompt).

### onDecrypted

`((values: Record<Handle, ClearValueType>) => void) | undefined`

Fired after all handles have been decrypted. Receives the full result map.

{% tabs %}
{% tab title="with callbacks" %}

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

{% endtab %}
{% endtabs %}

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type DecryptParams } from "@zama-fhe/react-sdk";
```

### handles

`DecryptHandle[]`

Array of handles to decrypt. Each entry pairs an encrypted handle with the address of the contract that owns it.

```ts
import { type DecryptHandle } from "@zama-fhe/react-sdk";
```

| Field             | Type      | Description                                            |
| ----------------- | --------- | ------------------------------------------------------ |
| `handle`          | `Handle`  | The encrypted handle (hex string) to decrypt.          |
| `contractAddress` | `Address` | Address of the contract that owns the encrypted value. |

Handles from different contracts can be mixed in a single call — `useUserDecrypt` automatically groups them by contract address and issues one decryption request per unique contract:

```tsx
const result = await decrypt.mutateAsync({
  handles: [
    { handle: "0xhandle1...", contractAddress: "0xContractA" },
    { handle: "0xhandle2...", contractAddress: "0xContractA" },
    { handle: "0xhandle3...", contractAddress: "0xContractB" },
  ],
});

// Single wallet signature, two decryption requests (one per contract)
// result: { "0xhandle1...": 500n, "0xhandle2...": 200n, "0xhandle3...": 1000n }
```

## Return Type

`data` resolves to `Record<Handle, ClearValueType>` — a map from each handle to its decrypted plaintext value (`bigint`, `boolean`, or `string`).

`values` is a reactive map of all tracked handles to their cached decrypted values (`undefined` if not yet decrypted). It updates automatically when decryption succeeds.

On success, results are written to the decryption cache so that the `values` map and any other `useUserDecrypt` instance tracking the same handles will update reactively.

{% include ".gitbook/includes/mutation-result.md" %}

## Credential Caching

`useUserDecrypt` uses the SDK's credential manager (`sdk.credentials`) to avoid unnecessary wallet prompts:

- **First call** — generates a new FHE keypair, creates EIP-712 typed data, and requests a wallet signature. The credentials are then cached.
- **Subsequent calls** — reuses the cached credentials if they are still valid (not expired).
- **Expiry** — credentials expire after `keypairTTL` seconds (default: 86400 = 1 day, configurable via SDK config). Once expired, the next call generates fresh credentials.

This means users only see a wallet signature prompt once per session (or per TTL window), even if they decrypt multiple times.

## Related

- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — high-level hook that decrypts token balances automatically with two-phase polling
- [`useEncrypt`](/reference/react/useEncrypt) — reverse operation, encrypt a plaintext value for on-chain submission
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt) — full walkthrough with end-to-end examples
