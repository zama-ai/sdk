---
title: useDecryptedValues
description: Pure read query hook that returns multiple cached decrypted values from the persistent decrypt cache — no wallet signature or relayer call.
---

# useDecryptedValues

Reads multiple decrypted values from the SDK's persistent decrypt cache in a single query. Returns a record mapping each handle to its cached value (or `null`) on mount — no wallet signature, no relayer call.

Use [`useUserDecrypt`](/reference/react/useUserDecrypt) to populate the cache, then `useDecryptedValues` to display cached values automatically.

## Import

```ts
import { useDecryptedValues } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useDecryptedValues, useUserDecrypt } from "@zama-fhe/react-sdk";
import type { DecryptHandle } from "@zama-fhe/react-sdk";

function Balances({ handles }: { handles: DecryptHandle[] }) {
  const decrypt = useUserDecrypt();
  const { data } = useDecryptedValues({ handles });

  return (
    <section>
      <button
        onClick={() => decrypt.mutate({ handles })}
        disabled={decrypt.isPending}
      >
        Decrypt all
      </button>
      <ul>
        {handles.map((h) => (
          <li key={h.handle}>
            {data?.[h.handle]?.toString() ?? "pending"}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

## Parameters

### handles

`DecryptHandle[]`

The handles to look up in the decrypt cache. Each entry pairs a `handle` with its `contractAddress`.

### query

`{ enabled?: boolean } | undefined`

Pass `{ enabled: false }` to disable the query.

## Return Type

Returns a standard `useQuery` result. `data` is `Record<Handle, ClearValueType | null>` — a map from each handle to its cached value, or `null` for handles not yet decrypted.

The query uses `staleTime: Infinity` and a deterministic query key (handles are sorted) for stable caching.

## Related

- [`useDecryptedValue`](/reference/react/useDecryptedValue) — single-handle variant
- [`useUserDecrypt`](/reference/react/useUserDecrypt) — mutation hook that populates the decrypt cache
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt) — full walkthrough
