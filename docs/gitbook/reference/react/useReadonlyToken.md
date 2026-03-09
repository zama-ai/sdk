---
title: useReadonlyToken
description: Hook to get a memoized ReadonlyToken instance for read-only access.
---

# useReadonlyToken

Hook to get a memoized `ReadonlyToken` instance. Use this when you only need to read balances and metadata without signing transactions.

## Import

```ts
import { useReadonlyToken } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useReadonlyToken } from "@zama-fhe/react-sdk";

function TokenInfo() {
  const readonlyToken = useReadonlyToken("0xToken"); // [!code focus]

  async function handleFetchMetadata() {
    const metadata = await readonlyToken.getMetadata(); // [!code focus]
    console.log(metadata.name, metadata.symbol, metadata.decimals);
  }

  async function handleCheckAllowed() {
    const allowed = await readonlyToken.isAllowed(); // [!code focus]
    console.log("Session valid:", allowed);
  }

  return (
    <div>
      <button onClick={handleFetchMetadata}>Get Metadata</button>
      <button onClick={handleCheckAllowed}>Check Session</button>
    </div>
  );
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
const readonlyToken = useReadonlyToken(
  "0xToken", // [!code focus]
);
```

## Return Type

`ReadonlyToken`

A memoized `ReadonlyToken` instance. The reference stays the same as long as the input address does not change. Provides read operations (metadata, balance checks, session status) without requiring a connected signer.

## Related

- [useToken](/reference/react/useToken) — full read/write `Token` instance
- [useZamaSDK](/reference/react/useZamaSDK) — access the underlying SDK instance directly
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — full API reference for the `ReadonlyToken` class
