---
title: useToken
description: Hook to get a memoized Token instance for a given address.
---

# useToken

Hook to get a memoized `Token` instance for a given address. The returned reference is stable across re-renders, making it safe to use in dependency arrays.

## Import

```ts
import { useToken } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useToken } from "@zama-fhe/react-sdk";

function TokenActions() {
  const token = useToken({ tokenAddress: "0xToken" }); // [!code focus]

  async function handleAllow() {
    await token.allow(); // [!code focus]
    console.log("Session authorized");
  }

  async function handleTransfer() {
    const txHash = await token.transfer({
      // [!code focus]
      to: "0xRecipient", // [!code focus]
      amount: 500n, // [!code focus]
    }); // [!code focus]
    console.log("Transfer:", txHash);
  }

  return (
    <div>
      <button onClick={handleAllow}>Allow</button>
      <button onClick={handleTransfer}>Transfer 500</button>
    </div>
  );
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseTokenParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
const token = useToken({
  tokenAddress: "0xToken", // [!code focus]
});
```

### wrapperAddress

`Address` (optional)

Explicit wrapper address. When omitted, the SDK resolves it automatically via the deployment coordinator.

```ts
const token = useToken({
  tokenAddress: "0xToken",
  wrapperAddress: "0xWrapper", // [!code focus]
});
```

## Return Type

`Token`

A memoized `Token` instance with full read and write access. The reference stays the same as long as the input addresses do not change.

## Related

- [useReadonlyToken](/reference/react/useReadonlyToken) — read-only variant (no signing required)
- [useZamaSDK](/reference/react/useZamaSDK) — access the underlying SDK instance directly
- [Token](/reference/sdk/Token) — full API reference for the `Token` class
