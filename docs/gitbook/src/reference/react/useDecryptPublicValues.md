---
title: useDecryptPublicValues
description: Mutation hook that decrypts publicly-decryptable FHE values using the network public key — no credential required.
---

# useDecryptPublicValues

Mutation hook that decrypts FHE encrypted values using the network public key. Unlike [`useDecryptValues`](./useDecryptValues.md), this requires no permit or wallet signature — it only works for values the contract has marked publicly decryptable. On success the results are available via `data.clearValues` and written to the persistent decrypt cache.

## Import

```ts
import { useDecryptPublicValues } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useDecryptPublicValues } from "@zama-fhe/react-sdk";

function RevealResult({ encryptedValues }: { encryptedValues: string[] }) {
  const { mutate: decryptPublicValues, data, isPending } = useDecryptPublicValues();

  return (
    <div>
      <button onClick={() => decryptPublicValues(encryptedValues)} disabled={isPending}>
        {isPending ? "Decrypting..." : "Reveal"}
      </button>
      {data && <output>{JSON.stringify(data.clearValues)}</output>}
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

The function passed to `mutate` / `mutateAsync` accepts:

### encryptedValues (first argument)

`EncryptedValue[]`

Array of encrypted values (hex strings) to decrypt with the network public key.

```ts
import { type EncryptedValue } from "@zama-fhe/sdk";
```

```ts
decryptPublicValues(["0xEncryptedValue1", "0xEncryptedValue2"]);
```

## Return Type

```ts
import { type DecryptPublicValuesResult } from "@zama-fhe/sdk";
```

The `data` property (after a successful mutation) is a `DecryptPublicValuesResult`:

| Field                   | Type                                 | Description                                                       |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `clearValues`           | `Record<EncryptedValue, ClearValue>` | Decrypted clear-text values keyed by their encrypted value.       |
| `abiEncodedClearValues` | `Hex`                                | The clear values ABI-encoded, as passed to on-chain verification. |
| `decryptionProof`       | `Hex`                                | KMS signature proving the decryption is authentic.                |

```ts
// data.clearValues => { "0xEncryptedValue1": 500n, ... }
```

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDecryptValues](./useDecryptValues.md) -- user decryption (requires a permit / wallet signature)
- [useDelegatedDecryptValues](./useDelegatedDecryptValues.md) -- decrypt using delegated user credentials
- [Encrypt & Decrypt guide](../../guides/encrypt-decrypt.md) -- full walkthrough with end-to-end examples
