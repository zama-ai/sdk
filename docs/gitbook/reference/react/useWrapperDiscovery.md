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

::: code-group

```tsx [WrapperInfo.tsx]
import { useWrapperDiscovery } from "@zama-fhe/react-sdk";

function WrapperInfo({ tokenAddress }: { tokenAddress: Address }) {
  const {
    data: wrapperAddress,
    isLoading,
    error,
  } = useWrapperDiscovery({
    // [!code focus]
    tokenAddress, // [!code focus]
    coordinatorAddress: "0xCoordinator", // [!code focus]
  }); // [!code focus]

  if (isLoading) return <p>Discovering wrapper...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <p>Wrapper: {wrapperAddress}</p>;
}
```

:::

## Parameters

### tokenAddress

`Address`

Address of the underlying ERC-20 token to look up.

```ts
useWrapperDiscovery({
  tokenAddress: "0xToken", // [!code focus]
  coordinatorAddress: "0xCoordinator",
});
```

### coordinatorAddress

`Address`

Address of the deployment coordinator contract that maps tokens to wrappers.

```ts
useWrapperDiscovery({
  tokenAddress: "0xToken",
  coordinatorAddress: "0xCoordinator", // [!code focus]
});
```

## Return Type

The `data` field resolves to `Address | undefined` -- the wrapper contract address for the given token.

<!--@include: @/shared/query-result.md-->

## Caching

The query uses `staleTime: Infinity`. Wrapper addresses are immutable once deployed, so the result never re-fetches automatically.

## Suspense

Use `useWrapperDiscoverySuspense` inside a `<Suspense>` boundary to avoid manual loading state handling:

```tsx
import { useWrapperDiscoverySuspense } from "@zama-fhe/react-sdk";

function WrapperInfo({ tokenAddress }: { tokenAddress: Address }) {
  const { data: wrapperAddress } = useWrapperDiscoverySuspense({
    // [!code focus]
    tokenAddress,
    coordinatorAddress: "0xCoordinator",
  });

  return <p>Wrapper: {wrapperAddress}</p>;
}
```

## Related

- [useMetadata](/reference/react/useMetadata) -- read token name, symbol, and decimals
- [Hooks overview](/reference/react/query-keys) -- all available hooks
