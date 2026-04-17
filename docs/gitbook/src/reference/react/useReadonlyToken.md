---
title: useReadonlyToken
description: Hook to get a memoized ReadonlyToken instance for balance decryption and metadata queries.
---

# useReadonlyToken

Hook to get a memoized `ReadonlyToken` instance for balance decryption and metadata queries.

## Import

```ts
import { useReadonlyToken } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useReadonlyToken } from "@zama-fhe/react-sdk";

function TokenInfo() {
  const readonlyToken = useReadonlyToken("0xToken");

  async function handleFetchMetadata() {
    const name = await readonlyToken.name();
    const symbol = await readonlyToken.symbol();
    const decimals = await readonlyToken.decimals();
    console.log(name, symbol, decimals);
  }

  async function handleCheckAllowed() {
    const allowed = await readonlyToken.isAllowed();
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

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
const readonlyToken = useReadonlyToken("0xToken");
```

## Return Type

`ReadonlyToken`

A memoized `ReadonlyToken` instance. The reference stays the same as long as the input address does not change.

## Related

- [useToken](/reference/react/useToken) — full read/write `Token` instance
- [useZamaSDK](/reference/react/useZamaSDK) — access the underlying SDK instance directly
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — full API reference for the `ReadonlyToken` class
