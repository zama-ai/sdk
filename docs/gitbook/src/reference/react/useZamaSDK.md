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
    const token = sdk.createToken("0xToken", "0xWrapper");
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
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
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
