---
title: useTokenPair
description: Fetch a single token wrapper pair by index from the registry.
---

# useTokenPair

Fetches a single token wrapper pair by its zero-based index from the `ConfidentialTokenWrappersRegistry` contract.

## Import

```ts
import { useTokenPair } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="SinglePair.tsx" %}

```tsx
import { useTokenPair } from "@zama-fhe/react-sdk";

function SinglePair({ index }: { index: bigint }) {
  const { data: pair, isLoading, error } = useTokenPair({ index });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!pair) return null;

  return (
    <div>
      <p>ERC-20: {pair.tokenAddress}</p>
      <p>Confidential: {pair.confidentialTokenAddress}</p>
      <p>Valid: {pair.isValid ? "Yes" : "No"}</p>
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### index

`bigint | undefined`

Zero-based pair index. Pass `undefined` to disable the query.

```ts
useTokenPair({ index: 0n });
```

## Return type

The `data` field resolves to `TokenWrapperPair`:

```ts
interface TokenWrapperPair {
  readonly tokenAddress: Address;
  readonly confidentialTokenAddress: Address;
  readonly isValid: boolean;
}
```

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useTokenPairsLength](/reference/react/useTokenPairsLength) -- get total count to know valid indices
- [useTokenPairsSlice](/reference/react/useTokenPairsSlice) -- fetch a range of pairs
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `getTokenPair()` method
