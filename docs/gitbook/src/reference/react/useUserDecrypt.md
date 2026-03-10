---
title: useUserDecrypt
description: Low-level mutation hook that decrypts an encrypted handle using the user's FHE credentials.
---

# useUserDecrypt

Low-level mutation hook that decrypts encrypted handles using the user's FHE credentials. The caller is responsible for providing all parameters (keypair, signature, contract addresses).

{% hint style="warning" %}
Most apps use [`useConfidentialBalance`](/reference/react/useConfidentialBalance), which decrypts automatically with two-phase polling. Reach for `useUserDecrypt` only when building custom decrypt flows.
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

function DecryptHandle({ handle }: { handle: string }) {
  const { mutateAsync: decrypt, isPending, data } = useUserDecrypt();

  async function handleDecrypt() {
    const result = await decrypt({
      handles: [handle],
      contractAddress: "0xContract",
      signedContractAddresses: ["0xContract"],
      privateKey: "...",
      publicKey: "...",
      signature: "0x...",
      durationDays: 30,
    });
    console.log("Decrypted:", result[handle]);
  }

  return (
    <button onClick={handleDecrypt} disabled={isPending}>
      {isPending ? "Decrypting..." : "Decrypt"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useUserDecrypt` takes no constructor parameters.

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type UserDecryptParams } from "@zama-fhe/sdk";
```

### handles

`Handle[]`

Encrypted handles to decrypt.

### contractAddress

`Address`

Address of the contract that owns the encrypted values.

### signedContractAddresses

`Address[]`

Contract addresses covered by the EIP-712 signature.

### privateKey / publicKey

`string`

The user's FHE keypair. Generate with [`useGenerateKeypair`](/reference/react/useGenerateKeypair).

### signature

`Hex`

EIP-712 wallet signature authorizing the decrypt.

### durationDays

`number`

Validity window of the signature in days.

## Return Type

`data` resolves to `Record<Handle, ClearValueType>` — a map from each handle to its decrypted plaintext value.

On success, results are written to the decryption cache so that `useUserDecryptedValue` and `useUserDecryptedValues` can read them without re-decrypting.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — high-level hook that decrypts balances automatically
- [`useEncrypt`](/reference/react/useEncrypt) — reverse operation, encrypt a plaintext value
- [`useGenerateKeypair`](/reference/react/useGenerateKeypair) — generate the FHE keypair needed for decryption
