---
title: useEncrypt
description: Low-level mutation hook that encrypts a plaintext value using the relayer's FHE engine.
---

# useEncrypt

Low-level mutation hook that encrypts plaintext values using the relayer's FHE engine. Returns encrypted values and an input proof for on-chain submission.

{% hint style="warning" %}
For **confidential ERC-20 tokens**, use [`useShield`](./useShield.md) or [`useConfidentialTransfer`](./useConfidentialTransfer.md) — they handle encryption automatically.

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
    const { encryptedValues, inputProof } = await encrypt({
      values: [{ value: 1000n, type: "euint64" }],
      contractAddress: "0xContract",
      userAddress: "0xUser",
    });
    // encryptedValues[0] is the encrypted value (0x hex), inputProof is the ZK proof — both contract-ready
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

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type EncryptParams } from "@zama-fhe/sdk";
```

### values

`EncryptInput[]`

Array of typed inputs. Each entry specifies a plaintext value and its encrypted type as a Solidity-style name (`bool`, `uint64`, `address`, etc.).

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

`data` resolves to `{ encryptedValues: EncryptedValue[], inputProof: Hex }` — `0x`-prefixed hex, ready to pass straight into a contract call.

- **`encryptedValues`** — one encrypted value per input.
- **`inputProof`** — the ZK input proof to submit alongside the encrypted values in a contract call.

{% include ".gitbook/includes/mutation-result.md" %}

## Supported FHE Types

Types use Solidity-style names — the value is encrypted to the matching FHE type (`uint64` → `euint64`) on-chain.

| Type      | JS value type         | Range                     |
| --------- | --------------------- | ------------------------- |
| `bool`    | `boolean \| 0n \| 1n` | `true`/`false` or `0`/`1` |
| `uint8`   | `bigint`              | 0–255                     |
| `uint16`  | `bigint`              | 0–65535                   |
| `uint32`  | `bigint`              | 0–2³²−1                   |
| `uint64`  | `bigint`              | 0–2⁶⁴−1                   |
| `uint128` | `bigint`              | 0–2¹²⁸−1                  |
| `uint256` | `bigint`              | 0–2²⁵⁶−1                  |
| `address` | `` `0x${string}` ``   | Ethereum address          |

## Related

- [`useShield`](./useShield.md) — high-level hook that encrypts and shields in one step
- [`useConfidentialTransfer`](./useConfidentialTransfer.md) — high-level hook that encrypts and transfers
- [`useDecryptValues`](./useDecryptValues.md) — reverse operation, decrypt encrypted values back to plaintext
- [Encrypt & Decrypt guide](../../guides/encrypt-decrypt.md) — full walkthrough with examples
