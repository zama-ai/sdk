---
title: useTokenPairsRegistry
description: Fetch all token wrapper pairs from the on-chain registry.
---

# useTokenPairsRegistry

Fetches all token wrapper pairs from the `ConfidentialTokenWrappersRegistry` contract on the current chain in a single call.

For large registries, prefer [`useListPairs`](/reference/react/useListPairs) with pagination.

## Import

```ts
import { useTokenPairsRegistry } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AllPairs.tsx" %}

```tsx
import { useTokenPairsRegistry } from "@zama-fhe/react-sdk";

function AllPairs() {
  const { data: pairs, isLoading, error } = useTokenPairsRegistry();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {pairs?.map((pair) => (
        <li key={pair.tokenAddress}>
          {pair.tokenAddress} &rarr; {pair.confidentialTokenAddress}
          {pair.isValid ? " (valid)" : " (invalid)"}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

This hook takes no parameters. The registry address is resolved automatically from the connected chain.

## Return type

The `data` field resolves to `readonly TokenWrapperPair[]`:

```ts
interface TokenWrapperPair {
  readonly tokenAddress: Address;
  readonly confidentialTokenAddress: Address;
  readonly isValid: boolean;
}
```

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useListPairs](/reference/react/useListPairs) -- paginated listing with optional metadata
- [useTokenPairsLength](/reference/react/useTokenPairsLength) -- get total count without fetching pairs
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `getTokenPairs()` method
