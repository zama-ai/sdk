---
title: useTokenPairsSlice
description: Fetch a range of token wrapper pairs from the registry by index.
---

# useTokenPairsSlice

Fetches a range of token wrapper pairs from the registry using start and end indices. This is the low-level pagination primitive — for page-based pagination, use [`useListPairs`](./useListPairs.md) instead.

## Import

```ts
import { useTokenPairsSlice } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="PairSlice.tsx" %}

```tsx
import { useTokenPairsSlice } from "@zama-fhe/react-sdk";

function PairSlice() {
  const {
    data: pairs,
    isLoading,
    error,
  } = useTokenPairsSlice({
    fromIndex: 0n,
    toIndex: 10n,
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {pairs?.map((pair) => (
        <li key={pair.tokenAddress}>
          {pair.tokenAddress} &rarr; {pair.confidentialTokenAddress}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### fromIndex

`bigint | undefined`

Start index (inclusive). Pass `undefined` to disable the query.

```ts
useTokenPairsSlice({ fromIndex: 0n, toIndex: 10n });
```

### toIndex

`bigint | undefined`

End index (exclusive). Pass `undefined` to disable the query.

```ts
useTokenPairsSlice({ fromIndex: 10n, toIndex: 20n });
```

## Return Type

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

- [useListPairs](./useListPairs.md) -- page-based pagination with metadata support
- [useTokenPairsLength](./useTokenPairsLength.md) -- get total count for pagination bounds
- [useTokenPair](./useTokenPair.md) -- fetch a single pair by index
- [WrappersRegistry](../sdk/WrappersRegistry.md) -- SDK-level `getTokenPairsSlice()` method
