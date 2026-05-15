---
title: useHasPermit
description: Query hook that checks whether stored permits cover the requested contract addresses.
---

# useHasPermit

Query hook that checks whether stored permits cover the requested contract addresses.

Returns `true` if decrypt operations can proceed without a wallet prompt. Returns `false` when no permits exist or the `permitTTL` has expired.

## Import

```ts
import { useHasPermit } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AuthGuard.tsx" %}

```tsx
import { useHasPermit, useGrantPermit } from "@zama-fhe/react-sdk";

const CONTRACTS = ["0xTokenA", "0xTokenB"] as const;

function AuthGuard() {
  const { data: allowed, isLoading } = useHasPermit({ contractAddresses: [...CONTRACTS] });
  const { mutateAsync: allow } = useGrantPermit();

  if (isLoading) return <span>Checking permits...</span>;

  if (!allowed) {
    return <button onClick={() => allow([...CONTRACTS])}>Authorize wallet</button>;
  }

  return <span>Permits active — decrypts will not prompt the wallet</span>;
}
```

{% endtab %}
{% tab title="Gated decrypt" %}

```tsx
import { useHasPermit, useGrantPermit, useUserDecrypt } from "@zama-fhe/react-sdk";

function GatedDecrypt({
  handle,
  contractAddress,
}: {
  handle: string;
  contractAddress: `0x${string}`;
}) {
  const { data: allowed } = useHasPermit({ contractAddresses: [contractAddress] });
  const { mutateAsync: allow } = useGrantPermit();
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

Contract addresses to check credentials against. Returns `true` only when stored permits cover **all** specified addresses.

```tsx
const { data: allowed } = useHasPermit({
  contractAddresses: ["0xContractA", "0xContractB"],
});
```

{% hint style="warning" %}
**You must gate decrypt queries yourself.** `useUserDecrypt` does not automatically wait for permits — if you call it before `useGrantPermit`, the user sees an unexpected wallet popup. Use `useHasPermit` to conditionally enable the decrypt query via `{ enabled: !!allowed }` as the second argument, or conditionally render the decrypt component only when `allowed` is `true`.
{% endhint %}

## Return Type

```ts
// Returns UseQueryResult<boolean, Error>
```

`data` is a `boolean`:

- `true` -- stored permits cover all specified addresses; decrypts will not prompt the wallet.
- `false` -- no stored permits, or the `permitTTL` has expired. Call [`useGrantPermit`](/reference/react/useGrantPermit) to authorize.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Avoid blind-sign wallet popups](/guides/encrypt-decrypt#3-avoid-blind-sign-wallet-popups) -- gating balance queries to avoid blind-sign popups
- [`useGrantPermit`](/reference/react/useGrantPermit) -- pre-authorize contracts with one wallet signature
- [`useRevokePermits`](/reference/react/useRevokePermits) -- revoke permits
- [Permit Model](/concepts/permit-model) -- permit lifecycle and TTL configuration
