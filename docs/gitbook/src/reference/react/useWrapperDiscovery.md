---
title: useWrapperDiscovery
description: Find the wrapper contract address for a token via the deployment coordinator.
---

# useWrapperDiscovery

Find the wrapper contract address for a token via the deployment coordinator. The result is cached indefinitely since wrapper addresses never change.

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
    coordinatorAddress: "0xCoordinator",
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

Address of the underlying ERC-20 token to look up.

```ts
useWrapperDiscovery({
  tokenAddress: "0xToken",
  coordinatorAddress: "0xCoordinator",
});
```

### coordinatorAddress

`Address`

Address of the deployment coordinator contract that maps tokens to wrappers.

```ts
useWrapperDiscovery({
  tokenAddress: "0xToken",
  coordinatorAddress: "0xCoordinator",
});
```

## Return Type

The `data` field resolves to `Address | undefined` -- the wrapper contract address for the given token.

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
    coordinatorAddress: "0xCoordinator",
  });

  return <p>Wrapper: {wrapperAddress}</p>;
}
```

## Related

- [useMetadata](/reference/react/useMetadata) -- read token name, symbol, and decimals
- [Hooks overview](/reference/react/query-keys) -- all available hooks
