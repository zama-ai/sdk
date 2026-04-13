---
title: useDelegationStatus
description: Query hook that checks whether a decryption delegation is active between two addresses.
---

# useDelegationStatus

Query hook that checks whether a decryption delegation is active between a delegator and delegate for a specific token. Returns both the active status and the raw expiry timestamp.

## Import

```ts
import { useDelegationStatus } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useDelegationStatus } from "@zama-fhe/react-sdk";

function DelegationBadge({
  tokenAddress,
  delegatorAddress,
  delegateAddress,
}: {
  tokenAddress: `0x${string}`;
  delegatorAddress: `0x${string}`;
  delegateAddress: `0x${string}`;
}) {
  const { data, isLoading } = useDelegationStatus({
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  });

  if (isLoading) return <span>Checking...</span>;
  if (!data?.isDelegated) return <span>Not delegated</span>;

  const expiry = data.expiryTimestamp;
  const label =
    expiry === BigInt("18446744073709551615")
      ? "Permanent"
      : `Expires ${new Date(Number(expiry) * 1000).toLocaleDateString()}`;

  return <span>Delegated ({label})</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseDelegationStatusConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token contract.

### delegatorAddress

`Address | undefined`

The address that granted the delegation. The query is disabled until this is provided.

### delegateAddress

`Address | undefined`

The address that received delegation rights. The query is disabled until this is provided.

```ts
const { data } = useDelegationStatus({
  tokenAddress: "0xToken",
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
```

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type DelegationStatusData } from "@zama-fhe/sdk/query";
```

`data` resolves to:

| Property          | Type      | Description                                                               |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `isDelegated`     | `boolean` | `true` if delegation exists and hasn't expired.                           |
| `expiryTimestamp` | `bigint`  | `0n` = no delegation, `2^64 - 1` = permanent, otherwise UTC Unix seconds. |

{% include ".gitbook/includes/query-result.md" %}

## Related

- [`useDelegateDecryption`](/reference/react/useDelegateDecryption) -- grant delegation
- [`useRevokeDelegation`](/reference/react/useRevokeDelegation) -- revoke delegation
- [Delegated Decryption](/reference/sdk/delegation) -- SDK reference
