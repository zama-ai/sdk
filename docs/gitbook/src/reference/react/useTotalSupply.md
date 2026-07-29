---
title: useTotalSupply
description: Read the total supply of a token.
---

# useTotalSupply

Read the total supply of a token. The result goes stale after 30 seconds to balance freshness against RPC cost.

## Import

```ts
import { useTotalSupply } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="TotalSupply.tsx" %}

```tsx
import { useTotalSupply } from "@zama-fhe/react-sdk";

function TotalSupply({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: totalSupply, isLoading } = useTotalSupply(tokenAddress);

  if (isLoading) return <span>Loading total supply...</span>;
  return <span>Total supply: {totalSupply?.toString() ?? "0"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the token contract to read the total supply from.

```ts
const { data: totalSupply } = useTotalSupply("0xToken");
```

### options

`Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn"> | undefined`

Standard React Query options, forwarded to `useQuery`. Passed as the second argument.

## Return Type

`data` is `bigint` — the token's total supply in its base units.

{% include ".gitbook/includes/query-result.md" %}

## Caching

The query uses a 30-second `staleTime`. Within that window the cached value is served without re-fetching; afterwards it re-fetches on the next access.

## Suspense

Use `useTotalSupplySuspense` inside a `<Suspense>` boundary to avoid manual loading state handling. The hook suspends rendering until the total supply is loaded, so `data` is always defined.

```tsx
import { useTotalSupplySuspense } from "@zama-fhe/react-sdk";

function TotalSupply({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: totalSupply } = useTotalSupplySuspense(tokenAddress);

  // data is always defined — no loading state needed
  return <span>Total supply: {totalSupply.toString()}</span>;
}
```

## Related

- [useMetadata](./useMetadata.md) -- read token name, symbol, and decimals
- [useConfidentialBalance](./useConfidentialBalance.md) -- read the decrypted confidential balance
