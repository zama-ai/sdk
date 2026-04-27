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
    const token = sdk.createReadonlyToken("0xToken");
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
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
} as const satisfies FheChain;

const zamaConfig = createConfig({
  chains: [mySepolia, myMainnet],
  relayers: {
    [mySepolia.id]: web(),
    [myMainnet.id]: web(),
  },
  wagmiConfig,
});
```

{% endtab %}
{% endtabs %}

## Parameters

None. The SDK instance is read from the nearest `ZamaProvider` context.

## Return Type

`ZamaSDK`

The configured SDK instance. Throws if called outside a `ZamaProvider`.

## Related

- [useToken](/reference/react/useToken) — memoized `Token` instance for a given address
- [useReadonlyToken](/reference/react/useReadonlyToken) — memoized `ReadonlyToken` instance (no write access)
- [ZamaSDK](/reference/sdk/ZamaSDK) — full API reference for the SDK class
