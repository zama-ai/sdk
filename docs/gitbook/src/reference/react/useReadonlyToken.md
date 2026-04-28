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

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
const readonlyToken = useReadonlyToken("0xToken");
```

## Return Type

`ReadonlyToken`

A memoized `ReadonlyToken` instance. The reference stays the same as long as the input address does not change. Provides read operations (metadata, balance checks, session status) without requiring a connected signer.

## Related

- [useToken](/reference/react/useToken) — full read/write `Token` instance
- [useZamaSDK](/reference/react/useZamaSDK) — access the underlying SDK instance directly
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — full API reference for the `ReadonlyToken` class
