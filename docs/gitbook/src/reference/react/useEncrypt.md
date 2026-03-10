---
title: useEncrypt
description: Low-level mutation hook that encrypts a plaintext value using the relayer's FHE engine.
---

# useEncrypt

Low-level mutation hook that encrypts plaintext values using the relayer's FHE engine. Returns encrypted handles and an input proof for on-chain submission.

{% hint style="warning" %}
Most apps use [`useShield`](/reference/react/useShield) or [`useConfidentialTransfer`](/reference/react/useConfidentialTransfer), which encrypt automatically. Reach for `useEncrypt` only when building custom FHE pipelines.
{% endhint %}

## Import

```ts
import { useEncrypt } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useEncrypt } from "@zama-fhe/react-sdk";

function EncryptValue() {
  const { mutateAsync: encrypt, isPending } = useEncrypt();

  async function handleEncrypt() {
    const { handles, inputProof } = await encrypt({
      values: [{ value: 1000n, type: "euint64" }],
      contractAddress: "0xContract",
      userAddress: "0xUser",
    });
    console.log("Encrypted handle:", handles[0]);
  }

  return (
    <button onClick={handleEncrypt} disabled={isPending}>
      {isPending ? "Encrypting..." : "Encrypt"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useEncrypt` takes no constructor parameters.

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type EncryptParams } from "@zama-fhe/sdk";
```

### values

`EncryptInput[]`

Array of typed inputs. Each entry specifies a plaintext value and its FHE type (`ebool`, `euint64`, `eaddress`, etc.).

### contractAddress

`Address`

Address of the contract that will consume the encrypted value.

### userAddress

`Address`

Address of the user performing the encryption.

## Return Type

```ts
import { type EncryptResult } from "@zama-fhe/sdk";
```

`data` resolves to `{ handles: Uint8Array[], inputProof: Uint8Array }`.

- **`handles`** — one encrypted handle per input value.
- **`inputProof`** — the ZK input proof to submit alongside the handles in a contract call.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useShield`](/reference/react/useShield) — high-level hook that encrypts and shields in one step
- [`useConfidentialTransfer`](/reference/react/useConfidentialTransfer) — high-level hook that encrypts and transfers
- [`useUserDecrypt`](/reference/react/useUserDecrypt) — reverse operation, decrypt a handle back to plaintext
