---
title: useToken
description: Hook returning a memoised Token instance for a given address.
---

# useToken

> ⚠️ This page is a placeholder — full reference docs are coming.

Returns a memoised [`Token`](../sdk/Token.md) instance bound to the SDK in the current `ZamaProvider`. The reference is stable across re-renders, making it safe to use in dependency arrays.

For ERC-7984 wrapper operations (shield, unshield, allowance), use [`useWrappedToken`](useWrappedToken.md) instead.

## Import

```ts
import { useToken } from "@zama-fhe/react-sdk";
```

## Signature

```ts
function useToken(address: Address): Token;
```

## Example

```tsx
import { useToken } from "@zama-fhe/react-sdk";

function TokenActions({ tokenAddress }: { tokenAddress: Address }) {
  const token = useToken(tokenAddress);

  async function handleTransfer() {
    const { txHash } = await token.confidentialTransfer("0xRecipient", 500n);
    console.log("Transfer:", txHash);
  }

  return <button onClick={handleTransfer}>Transfer 500</button>;
}
```

## Related

- [`useWrappedToken`](useWrappedToken.md) — wrapper operations (shield, unshield, allowance)
- [`useZamaSDK`](useZamaSDK.md) — access the underlying SDK instance directly
- [`Token`](../sdk/Token.md) — the underlying class
