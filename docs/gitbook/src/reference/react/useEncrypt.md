---
title: useEncrypt
description: Low-level mutation hook that encrypts a plaintext value using the relayer's FHE engine.
---

# useEncrypt

Low-level mutation hook that encrypts plaintext values using the relayer's FHE engine. Returns encrypted handles and an input proof for on-chain submission.

{% hint style="warning" %}
For **confidential ERC-20 tokens**, use [`useShield`](/reference/react/useShield) or [`useConfidentialTransfer`](/reference/react/useConfidentialTransfer) — they handle encryption automatically.

Use `useEncrypt` when your smart contract uses FHE types directly (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract that accepts encrypted parameters).
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
    // handles[0] is the encrypted Uint8Array, inputProof is the ZK proof
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

## Supported FHE Types

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

## Related

- [`useShield`](/reference/react/useShield) — high-level hook that encrypts and shields in one step
- [`useConfidentialTransfer`](/reference/react/useConfidentialTransfer) — high-level hook that encrypts and transfers
- [`useUserDecrypt`](/reference/react/useUserDecrypt) — reverse operation, decrypt handles back to plaintext
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt) — full walkthrough with examples
