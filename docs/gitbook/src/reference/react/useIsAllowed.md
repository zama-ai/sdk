---
title: useIsAllowed
description: Query hook that checks whether a session signature is cached and valid.
---

# useIsAllowed

Query hook that checks whether a session signature is cached and valid.

Returns `true` if decrypt operations can proceed without a wallet prompt. Returns `false` once the `sessionTTL` has expired (default: 30 days).

## Import

```ts
import { useIsAllowed } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AuthGuard.tsx" %}

```tsx
import { useIsAllowed, useAllow } from "@zama-fhe/react-sdk";

const CONTRACTS = ["0xTokenA", "0xTokenB"] as const;

function AuthGuard() {
  const { data: allowed, isLoading } = useIsAllowed({ contractAddresses: [...CONTRACTS] });
  const { mutateAsync: allow } = useAllow();

  if (isLoading) return <span>Checking session...</span>;

  if (!allowed) {
    return <button onClick={() => allow([...CONTRACTS])}>Authorize wallet</button>;
  }

  return <span>Session active — decrypts will not prompt the wallet</span>;
}
```

{% endtab %}
{% tab title="Gated decrypt" %}

```tsx
import { useIsAllowed, useAllow, useUserDecrypt } from "@zama-fhe/react-sdk";

function GatedDecrypt({
  handle,
  contractAddress,
}: {
  handle: string;
  contractAddress: `0x${string}`;
}) {
  const { data: allowed } = useIsAllowed({ contractAddresses: [contractAddress] });
  const { mutateAsync: allow } = useAllow();
  const { data, isPending } = useUserDecrypt(
    { handles: [{ handle, contractAddress }] },
    { enabled: !!allowed }, // only decrypt once authorized
  );

  if (!allowed) {
    return <button onClick={() => allow([contractAddress])}>Authorize</button>;
  }

  if (isPending) return <span>Decrypting...</span>;
  return <output>{data?.[handle]?.toString()}</output>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### contractAddresses

`Address[]` — **required**

Contract addresses to check credentials against. Returns `true` only when cached credentials cover **all** specified addresses.

```tsx
const { data: allowed } = useIsAllowed({
  contractAddresses: ["0xContractA", "0xContractB"],
});
```

{% hint style="warning" %}
**You must gate decrypt queries yourself.** `useUserDecrypt` does not automatically wait for credentials — if you call it before `useAllow`, the user sees an unexpected wallet popup. Use `useIsAllowed` to conditionally enable the decrypt query via `{ enabled: !!allowed }` as the second argument, or conditionally render the decrypt component only when `allowed` is `true`.
{% endhint %}

## Return Type

```ts
// Returns UseQueryResult<boolean, Error>
```

`data` is a `boolean`:

- `true` -- a valid session signature is cached; decrypts will not prompt the wallet.
- `false` -- no cached signature, or the `sessionTTL` has expired. Call [`useAllow`](/reference/react/useAllow) to re-authorize.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [`useAllow`](/reference/react/useAllow) -- pre-authorize contracts with one wallet signature
- [`useRevoke`](/reference/react/useRevoke) -- revoke session credentials
- [Session Model](/concepts/session-model) -- security model and TTL configuration
