---
title: useUserDecrypt
description: Query hook for user decryption of FHE handles. Requester-scoped, cache-backed, and opt-in by default.
---

# useUserDecrypt

`useUserDecrypt` is the query-based hook for user decryption. It resolves the connected signer address, builds a requester-scoped query key, reuses cached plaintext when available, and delegates the actual decryption flow to the SDK.

Because decrypting may require wallet authorization, the hook defaults to `enabled: false`. Turn it on explicitly when the user chooses to reveal data.

{% hint style="info" %}
For confidential ERC-20 balances, prefer [`useConfidentialBalance`](/reference/react/useConfidentialBalance). Use `useUserDecrypt` for custom contracts that expose FHE handles directly.
{% endhint %}

## Import

```ts
import { useUserDecrypt } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";
import { useState } from "react";

function RevealValue() {
  const [revealed, setRevealed] = useState(false);

  const decrypt = useUserDecrypt(
    {
      handles: [
        {
          handle: "0xhandle...",
          contractAddress: "0xYourContract",
        },
      ],
    },
    {
      enabled: revealed,
    },
  );

  return (
    <section>
      <button onClick={() => setRevealed(true)} disabled={decrypt.isFetching}>
        {decrypt.isFetching ? "Decrypting..." : "Reveal"}
      </button>
      {decrypt.error && <p role="alert">Error: {decrypt.error.message}</p>}
      {decrypt.data?.["0xhandle..."] !== undefined && (
        <output>Value: {String(decrypt.data["0xhandle..."])}</output>
      )}
    </section>
  );
}
```

## Parameters

### config

```ts
import { type UseUserDecryptConfig } from "@zama-fhe/react-sdk";
```

| Field     | Type              | Description                                                       |
| --------- | ----------------- | ----------------------------------------------------------------- |
| `handles` | `DecryptHandle[]` | Handles to decrypt, each paired with its owning contract address. |

### options

```ts
import { type UseUserDecryptOptions } from "@zama-fhe/react-sdk";
```

`UseUserDecryptOptions` is a `useQuery`-style options object with `queryKey`, `queryFn`, and `enabled` owned by the hook.

| Field     | Type      | Description                                            |
| --------- | --------- | ------------------------------------------------------ |
| `enabled` | `boolean` | Whether to run the decrypt query. Defaults to `false`. |

## Return Type

`useUserDecrypt` returns a standard TanStack `UseQueryResult<Record<Handle, ClearValueType>, Error>`.

- `data` is a map from handle to plaintext.
- `isFetching` indicates an active decrypt request.
- `error` contains authorization or relayer failures.

The query uses:

- requester-scoped query keys for cache isolation
- `staleTime: Infinity` because decrypted handle values are immutable
- `retry: false` to avoid repeated wallet prompts after rejected signatures

## Related

- [`useConfidentialBalance`](/reference/react/useConfidentialBalance)
- [`useEncrypt`](/reference/react/useEncrypt)
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt)
