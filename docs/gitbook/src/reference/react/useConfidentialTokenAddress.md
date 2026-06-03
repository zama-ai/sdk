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

- `[true, address]` -- registered and valid; `address` is the confidential token
- `[false, nonZeroAddress]` -- registered but revoked; `address` is the former confidential token
- `[false, zeroAddress]` -- no registered pair

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useTokenAddress](/reference/react/useTokenAddress) -- reverse lookup (confidential &rarr; plain)
- [useIsConfidentialTokenValid](/reference/react/useIsConfidentialTokenValid) -- check if a confidential token is valid
- [useWrapperDiscovery](/reference/react/useWrapperDiscovery) -- alternative lookup via the deployment coordinator
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `getConfidentialTokenAddress()` method
