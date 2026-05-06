---
title: useWrappedToken
description: React hook returning a memoised WrappedToken instance.
---

# useWrappedToken

> ⚠️ This page is a placeholder — full reference docs are coming.

Returns a memoised [`WrappedToken`](../sdk/WrappedToken.md) bound to the SDK in the current `ZamaProvider`. Use it for ERC-7984 wrapper operations (shield, unshield, allowance).

## Import

```ts
import { useWrappedToken } from "@zama-fhe/react-sdk";
```

## Signature

```ts
function useWrappedToken(address: Address): WrappedToken;
```

## Example

```tsx
function ShieldButton({ wrapperAddress }: { wrapperAddress: Address }) {
  const wrappedToken = useWrappedToken(wrapperAddress);
  return (
    <button onClick={() => wrappedToken.shield(1000n)}>Shield</button>
  );
}
```

## Related

- [`useToken`](useToken.md) — base read/write token interface
- [`WrappedToken`](../sdk/WrappedToken.md) — the underlying class
