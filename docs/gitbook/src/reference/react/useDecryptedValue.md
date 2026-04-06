---
title: useDecryptedValue
description: Pure read query hook that returns a single cached decrypted value from the persistent decrypt cache — no wallet signature or relayer call.
---

# useDecryptedValue

Reads a single decrypted value from the SDK's persistent decrypt cache. Returns the cached `ClearValueType` on mount — no wallet signature, no relayer call. Values survive page reloads when the SDK is backed by persistent storage (e.g. IndexedDB).

Use [`useUserDecrypt`](/reference/react/useUserDecrypt) to populate the cache, then `useDecryptedValue` to display cached values automatically.

{% hint style="info" %}
**Separation of concerns:**
- `useUserDecrypt` = mutation = "decrypt these handles" (may trigger wallet prompt)
- `useDecryptedValue` = query = "read cached value" (pure read, `staleTime: Infinity`)
{% endhint %}

## Import

```ts
import { useDecryptedValue } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useDecryptedValue, useUserDecrypt } from "@zama-fhe/react-sdk";

function Balance({ handle, contractAddress }) {
  const decrypt = useUserDecrypt();

  // Pure read — renders cached value on mount, even after page reload
  const { data: balance } = useDecryptedValue({
    handle: { handle, contractAddress },
  });

  return (
    <div>
      <span>{balance?.toString() ?? "Not decrypted yet"}</span>
      <button
        onClick={() => decrypt.mutate({ handles: [{ handle, contractAddress }] })}
        disabled={decrypt.isPending}
      >
        Decrypt
      </button>
    </div>
  );
}
```

## Parameters

### handle

`DecryptHandle`

The handle to look up in the decrypt cache. Must include both `handle` (hex string) and `contractAddress`.

| Field             | Type      | Description                                            |
| ----------------- | --------- | ------------------------------------------------------ |
| `handle`          | `Handle`  | The encrypted handle (hex string) to look up.          |
| `contractAddress` | `Address` | Address of the contract that owns the encrypted value. |

### query

`{ enabled?: boolean } | undefined`

Pass `{ enabled: false }` to disable the query.

## Return Type

Returns a standard `useQuery` result. `data` is `ClearValueType | null` — the cached decrypted value, or `null` if the handle hasn't been decrypted yet.

The query uses `staleTime: Infinity` — it fetches once from the persistent decrypt cache and never refetches automatically. After a successful `useUserDecrypt` mutation, the TanStack Query cache is updated automatically via the mutation's `onSuccess` handler, so `useDecryptedValue` reflects the new value without manual invalidation.

## Related

- [`useDecryptedValues`](/reference/react/useDecryptedValues) — batch variant for multiple handles
- [`useUserDecrypt`](/reference/react/useUserDecrypt) — mutation hook that populates the decrypt cache
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt) — full walkthrough
