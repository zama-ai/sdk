---
title: useTokenPairsLength
description: Get the total number of token wrapper pairs in the registry.
---

# useTokenPairsLength

Returns the total number of token wrapper pairs registered in the `ConfidentialTokenWrappersRegistry` contract on the current chain.

Useful for building pagination controls or displaying registry statistics.

## Import

```ts
import { useTokenPairsLength } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="PairCount.tsx" %}

```tsx
import { useTokenPairsLength } from "@zama-fhe/react-sdk";

function PairCount() {
  const { data: count, isLoading } = useTokenPairsLength();

  if (isLoading) return <p>Loading...</p>;

  return <p>{count?.toString()} token pairs registered</p>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

This hook takes no parameters. The registry address is resolved automatically from the connected chain.

## Return type

The `data` field resolves to `bigint` -- the total number of registered pairs.

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useListPairs](/reference/react/useListPairs) -- paginated pair listing
- [useTokenPairsSlice](/reference/react/useTokenPairsSlice) -- fetch a range of pairs by index
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `getTokenPairsLength()` method
