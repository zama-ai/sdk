---
title: useConfidentialTokenAddress
description: Look up the confidential token address for a given plain ERC-20 token.
---

# useConfidentialTokenAddress

Looks up the confidential token address for a given plain ERC-20 token address via the on-chain wrappers registry.

## Import

```ts
import { useConfidentialTokenAddress } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="LookupWrapper.tsx" %}

```tsx
import { useConfidentialTokenAddress } from "@zama-fhe/react-sdk";

function LookupWrapper({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data, isLoading, error } = useConfidentialTokenAddress({
    tokenAddress,
  });

  if (isLoading) return <p>Looking up...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!data) return null;

  const [found, confidentialAddress] = data;

  if (!found) return <p>No confidential token registered for this ERC-20</p>;

  return <p>Confidential token: {confidentialAddress}</p>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address | undefined`

The plain ERC-20 token address to look up. Pass `undefined` to disable the query.

```ts
useConfidentialTokenAddress({ tokenAddress: "0xUSDC" });
```

## Return Type

The `data` field resolves to `readonly [boolean, Address]`:

- `[true, address]` -- a confidential token was found at `address`
- `[false, address]` -- no registered pair (the address value is meaningless)

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useTokenAddress](./useTokenAddress.md) -- reverse lookup (confidential &rarr; plain)
- [useIsConfidentialTokenValid](./useIsConfidentialTokenValid.md) -- check if a confidential token is valid
- [useWrapperDiscovery](./useWrapperDiscovery.md) -- alternative lookup via the deployment coordinator
- [WrappersRegistry](../sdk/WrappersRegistry.md) -- SDK-level `getConfidentialTokenAddress()` method
