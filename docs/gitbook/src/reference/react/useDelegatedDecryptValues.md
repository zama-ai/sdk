---
title: useDelegatedDecryptValues
description: Mutation hook that decrypts FHE encrypted values using delegated user credentials.
---

# useDelegatedDecryptValues

Mutation hook that decrypts FHE encrypted values on behalf of a delegator who granted the connected wallet decryption rights (via [`useDelegateDecryption`](./useDelegateDecryption.md)). Returns a map of encrypted value to plaintext.

## Import

```ts
import { useDelegatedDecryptValues } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useDelegatedDecryptValues } from "@zama-fhe/react-sdk";

const CONTRACT = "0xYourContract" as const;

function DecryptAsDelegate({
  encryptedValue,
  delegatorAddress,
}: {
  encryptedValue: string;
  delegatorAddress: `0x${string}`;
}) {
  const { mutate: decrypt, data, isPending } = useDelegatedDecryptValues();

  return (
    <div>
      <button
        onClick={() =>
          decrypt({
            encryptedInputs: [{ encryptedValue, contractAddress: CONTRACT }],
            delegatorAddress,
          })
        }
        disabled={isPending}
      >
        {isPending ? "Decrypting..." : "Decrypt"}
      </button>
      {data && <output>{data[encryptedValue]?.toString()}</output>}
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

This hook takes no arguments.

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type DelegatedDecryptValuesMutationParams } from "@zama-fhe/sdk/query";
```

The function passed to `mutate` / `mutateAsync` accepts:

### encryptedInputs

`DecryptInput[]`

Encrypted values (with their contract addresses) to decrypt. Each entry pairs an encrypted value with the address of the contract that owns it.

```ts
import { type DecryptInput } from "@zama-fhe/sdk";
```

| Field             | Type             | Description                                            |
| ----------------- | ---------------- | ------------------------------------------------------ |
| `encryptedValue`  | `EncryptedValue` | The encrypted value (hex string) to decrypt.           |
| `contractAddress` | `Address`        | Address of the contract that owns the encrypted value. |

### delegatorAddress

`Address`

Address of the account that delegated decryption rights to the connected wallet.

```ts
decrypt({
  encryptedInputs: [{ encryptedValue: "0xEncryptedValue1", contractAddress: "0xContract" }],
  delegatorAddress: "0xDelegator",
});
```

## Return Type

The `data` property (after a successful mutation) is `Record<EncryptedValue, ClearValue>` — a map from each encrypted value to its decrypted plaintext value (`bigint`, `boolean`, or `string`).

```ts
// data => { "0xEncryptedValue1": 1000n }
```

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDelegateDecryption](./useDelegateDecryption.md) -- grant decryption rights to another address
- [useDecryptBalanceAs](./useDecryptBalanceAs.md) -- decrypt a token balance as the delegate
- [useDecryptValues](./useDecryptValues.md) -- decrypt your own values (non-delegated)
- [Delegated Decryption](../sdk/delegation.md) -- SDK reference
