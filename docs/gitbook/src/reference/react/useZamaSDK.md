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

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useZamaSDK } from "@zama-fhe/react-sdk";

function AdvancedOperations() {
  const sdk = useZamaSDK();

  async function handleCustomOperation() {
    // Access the SDK directly for operations not covered by hooks
    const token = sdk.createToken("0xToken");
    const name = await token.name();
    const symbol = await token.symbol();
    console.log(name, symbol);
  }

  return <button onClick={handleCustomOperation}>Run</button>;
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// In your app layout:
// <ZamaProvider config={zamaConfig}>
//   <App />
// </ZamaProvider>
```

{% endtab %}
{% endtabs %}

## Parameters

None. The SDK instance is read from the nearest `ZamaProvider` context.

## Return Type

`ZamaSDK`

The configured SDK instance. Throws if called outside a `ZamaProvider`.

## Related

- [useToken](./useToken.md) — memoised `Token` instance for a given address
- [useWrappedToken](./useWrappedToken.md) — memoised `WrappedToken` for ERC-7984 wrapper operations
- [ZamaSDK](../sdk/ZamaSDK.md) — full API reference for the SDK class
