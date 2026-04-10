---
title: useWrapperDiscovery
description: Find the confidential wrapper contract address for an ERC-20 token via the on-chain registry.
---

# useWrapperDiscovery

Find the confidential wrapper contract address for an ERC-20 token via the on-chain registry. The result is cached indefinitely since wrapper addresses never change.

## Import

```ts
import { useWrapperDiscovery } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="WrapperInfo.tsx" %}

```tsx
import { useWrapperDiscovery } from "@zama-fhe/react-sdk";

function WrapperInfo({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const {
    data: wrapperAddress,
    isLoading,
    error,
  } = useWrapperDiscovery({
    tokenAddress,
    erc20Address: "0xUSDC",
  });

  if (isLoading) return <p>Discovering wrapper...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <p>Wrapper: {wrapperAddress}</p>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of any confidential token you control. Used to scope the query cache key and to gate whether the query is enabled — it does not affect which wrapper the registry returns.

### erc20Address

`Address | undefined`

Address of the ERC-20 token to discover the wrapper for. Pass `undefined` to disable the query.

```ts
useWrapperDiscovery({
  tokenAddress: "0xConfidentialToken",
  erc20Address: "0xUSDC",
});
```

## Return type

The `data` field resolves to `Address | null` -- the wrapper contract address for the given token, or `null` if no wrapper exists.

{% include ".gitbook/includes/query-result.md" %}

## Caching

The query uses `staleTime: Infinity`. Wrapper addresses are immutable once deployed, so the result never re-fetches automatically.

## Suspense

Use `useWrapperDiscoverySuspense` inside a `<Suspense>` boundary to avoid manual loading state handling:

```tsx
import { useWrapperDiscoverySuspense } from "@zama-fhe/react-sdk";

function WrapperInfo({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: wrapperAddress } = useWrapperDiscoverySuspense({
    tokenAddress,
    erc20Address: "0xUSDC",
  });

  return <p>Wrapper: {wrapperAddress}</p>;
}
```

## Related

- [useMetadata](/reference/react/useMetadata) -- read token name, symbol, and decimals
- [Hooks overview](/reference/react/query-keys) -- all available hooks
