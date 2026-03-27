---
title: useTokenAddress
description: Reverse lookup -- find the plain ERC-20 address for a given confidential token.
---

# useTokenAddress

Reverse lookup -- finds the plain ERC-20 token address for a given confidential token address via the on-chain wrappers registry.

## Import

```ts
import { useTokenAddress } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ReverseLookup.tsx" %}

```tsx
import { useTokenAddress } from "@zama-fhe/react-sdk";

function ReverseLookup({ confidentialTokenAddress }: { confidentialTokenAddress: `0x${string}` }) {
  const { data, isLoading, error } = useTokenAddress({
    confidentialTokenAddress,
  });

  if (isLoading) return <p>Looking up...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!data) return null;

  const [found, plainAddress] = data;

  if (!found) return <p>No underlying ERC-20 found</p>;

  return <p>Underlying ERC-20: {plainAddress}</p>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### confidentialTokenAddress

`Address | undefined`

The confidential token address to look up. Pass `undefined` to disable the query.

```ts
useTokenAddress({ confidentialTokenAddress: "0xcUSDC" });
```

## Return Type

The `data` field resolves to `readonly [boolean, Address]`:

- `[true, address]` -- the underlying ERC-20 was found at `address`
- `[false, address]` -- no registered pair (the address value is meaningless)

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useConfidentialTokenAddress](/reference/react/useConfidentialTokenAddress) -- forward lookup (plain &rarr; confidential)
- [useIsConfidentialTokenValid](/reference/react/useIsConfidentialTokenValid) -- check if a confidential token is valid
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `getTokenAddress()` method
