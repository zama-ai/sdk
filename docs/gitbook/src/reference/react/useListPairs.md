---
title: useListPairs
description: Fetch paginated token wrapper pairs from the on-chain registry, with optional metadata enrichment.
---

# useListPairs

Fetches paginated token wrapper pairs from the on-chain `ConfidentialTokenWrappersRegistry`. Supports optional metadata enrichment (name, symbol, decimals, totalSupply) for both the underlying ERC-20 and the confidential token.

This is the recommended hook for building token-pair listings. For raw index-based access, see the lower-level hooks.

## Import

```ts
import { useListPairs } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="TokenPairList.tsx" %}

```tsx
import { useListPairs } from "@zama-fhe/react-sdk";

function TokenPairList() {
  const { data, isLoading, error } = useListPairs({
    page: 1,
    pageSize: 20,
    metadata: true,
  });

  if (isLoading) return <p>Loading pairs...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!data) return null;

  return (
    <div>
      <p>
        {data.total} pairs total (page {data.page})
      </p>
      <ul>
        {data.items.map((pair) => (
          <li key={pair.tokenAddress}>
            {"underlying" in pair
              ? `${pair.underlying.symbol} -> ${pair.confidential.symbol}`
              : `${pair.tokenAddress} -> ${pair.confidentialTokenAddress}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### page

`number | undefined`

Page number (1-indexed). Default: `1`.

```ts
useListPairs({ page: 2 });
```

### pageSize

`number | undefined`

Number of items per page. Default: `100`.

```ts
useListPairs({ pageSize: 20 });
```

### metadata

`boolean | undefined`

When `true`, fetches on-chain metadata (name, symbol, decimals) for both tokens, plus `totalSupply` for the underlying ERC-20. Default: `false`.

```ts
useListPairs({ metadata: true });
```

## Return Type

The `data` field resolves to `PaginatedResult<TokenWrapperPair | TokenWrapperPairWithMetadata>`:

```ts
interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
```

When `metadata: false` (default), items are `TokenWrapperPair`:

```ts
interface TokenWrapperPair {
  readonly tokenAddress: Address;
  readonly confidentialTokenAddress: Address;
  readonly isValid: boolean;
}
```

When `metadata: true`, items are `TokenWrapperPairWithMetadata`:

```ts
interface TokenWrapperPairWithMetadata extends TokenWrapperPair {
  readonly underlying: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
    readonly totalSupply: bigint;
  };
  readonly confidential: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
}
```

{% include "../../.gitbook/includes/query-result.md" %}

## Caching

Results are cached with a TTL matching the SDK's `registryTTL` (default: 24 hours). The registry uses an in-memory cache shared across all registry queries.

## Related

- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level registry class with `listPairs()` method
- [useTokenPairsRegistry](/reference/react/useTokenPairsRegistry) -- fetch all pairs at once (no pagination)
- [useConfidentialTokenAddress](/reference/react/useConfidentialTokenAddress) -- look up a single token's wrapper
- [Query Keys](/reference/react/query-keys) -- manual cache control via `zamaQueryKeys.wrappersRegistry`
