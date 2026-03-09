---
title: useMetadata
description: Get token name, symbol, and decimals in one call.
---

# useMetadata

Get token name, symbol, and decimals in one call. The result is cached indefinitely since token metadata never changes.

## Import

```ts
import { useMetadata } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [TokenHeader.tsx]
import { useMetadata } from "@zama-fhe/react-sdk";

function TokenHeader({ tokenAddress }: { tokenAddress: Address }) {
  const { data: meta, isLoading } = useMetadata(tokenAddress); // [!code focus]

  if (isLoading) return <p>Loading metadata...</p>;

  return (
    <h2>
      {meta?.name} ({meta?.symbol}) -- {meta?.decimals} decimals
    </h2>
  );
}
```

:::

## Parameters

### tokenAddress

`Address`

Address of the token contract to read metadata from.

```ts
const { data: meta } = useMetadata(
  "0xToken", // [!code focus]
);
```

## Return Type

The `data` field resolves to:

```ts
{
  name: string
  symbol: string
  decimals: number
} | undefined
```

<!--@include: @/shared/query-result.md-->

## Caching

The query uses `staleTime: Infinity`. Token metadata is immutable, so the result never re-fetches automatically.

## Suspense

Use `useMetadataSuspense` inside a `<Suspense>` boundary to avoid manual loading state handling:

```tsx
import { useMetadataSuspense } from "@zama-fhe/react-sdk";

function TokenHeader({ tokenAddress }: { tokenAddress: Address }) {
  const { data: meta } = useMetadataSuspense(tokenAddress); // [!code focus]

  return (
    <h2>
      {meta.name} ({meta.symbol}) -- {meta.decimals} decimals
    </h2>
  );
}
```

## Related

- [useWrapperDiscovery](/reference/react/useWrapperDiscovery) -- find the wrapper address for a token
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- read the decrypted confidential balance
- [Hooks overview](/reference/react/query-keys) -- all available hooks
