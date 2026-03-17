---
title: useUserDecrypt
description: Low-level mutation hook that decrypts an encrypted handle using the user's FHE credentials.
---

# useUserDecrypt

Low-level mutation hook that decrypts encrypted handles using the user's FHE credentials. The caller is responsible for providing all parameters (keypair, signature, contract addresses).

{% hint style="warning" %}
**You probably want a higher-level hook instead:**

- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — decrypts token balances automatically with two-phase polling.
- [`useUserDecryptFlow`](/guides/encrypt-decrypt#3.-decrypt-with-useuserdecryptflow) — manages the full keypair/EIP-712/signature orchestration for you. All session parameters are inherited from SDK config.

Reach for `useUserDecrypt` only when you need to manage the FHE keypair and signing flow yourself (e.g. reusing a keypair across multiple operations or integrating a custom signing workflow).
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
      privateKey: "0x...",
      publicKey: "0x...",
      signature: "0x...",
      signerAddress: "0xUser",
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 1,
    });
    // result[handle] contains the decrypted bigint value
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

{% hint style="info" %}
Most of these parameters (keypair, signature, timestamps) are managed automatically by [`useUserDecryptFlow`](/guides/encrypt-decrypt#3.-decrypt-with-useuserdecryptflow). You only need to provide them manually if you have a specific reason to control the decrypt lifecycle yourself.
{% endhint %}

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

`Hex`

The user's FHE keypair (hex-encoded). Generate with [`useGenerateKeypair`](/reference/react/useGenerateKeypair).

### signature

`Hex`

EIP-712 wallet signature authorizing the decrypt.

### signerAddress

`Address`

The address of the wallet that signed the EIP-712 authorization.

### startTimestamp

`number`

Unix timestamp (in seconds) marking the start of the credential validity window. Typically `Math.floor(Date.now() / 1000)`.

### durationDays

`number`

Validity window of the credential in days (from `startTimestamp`).

## Return Type

`data` resolves to `Record<Handle, ClearValueType>` — a map from each handle to its decrypted plaintext value.

On success, results are written to the decryption cache so that `useUserDecryptedValue` and `useUserDecryptedValues` can read them without re-decrypting.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useUserDecryptFlow`](/guides/encrypt-decrypt#3.-decrypt-with-useuserdecryptflow) — recommended high-level hook that manages the full decrypt orchestration
- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — high-level hook that decrypts token balances automatically
- [`useEncrypt`](/reference/react/useEncrypt) — reverse operation, encrypt a plaintext value
- [`useGenerateKeypair`](/reference/react/useGenerateKeypair) — generate the FHE keypair needed for decryption
