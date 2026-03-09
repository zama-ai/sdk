---
title: useZamaSDK
description: Hook to access the raw ZamaSDK instance from ZamaProvider context.
---

# useZamaSDK

Hook to access the raw `ZamaSDK` instance from `ZamaProvider` context. Use this for advanced scenarios where the standard hooks do not cover your use case.

## Import

```ts
import { useZamaSDK } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useZamaSDK } from "@zama-fhe/react-sdk";

function AdvancedOperations() {
  const sdk = useZamaSDK(); // [!code focus]

  async function handleCustomOperation() {
    // Access the SDK directly for operations not covered by hooks
    const token = sdk.getToken({
      // [!code focus]
      tokenAddress: "0xToken", // [!code focus]
      wrapperAddress: "0xWrapper", // [!code focus]
    }); // [!code focus]
    const metadata = await token.getMetadata();
    console.log(metadata.name, metadata.symbol);
  }

  return <button onClick={handleCustomOperation}>Run</button>;
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

None. The SDK instance is read from the nearest `ZamaProvider` context.

## Return Type

`ZamaSDK`

The configured SDK instance. Throws if called outside a `ZamaProvider`.

## Related

- [useToken](/reference/react/useToken) — memoized `Token` instance for a given address
- [useReadonlyToken](/reference/react/useReadonlyToken) — memoized `ReadonlyToken` instance (no write access)
- [ZamaSDK](/reference/sdk/ZamaSDK) — full API reference for the SDK class
