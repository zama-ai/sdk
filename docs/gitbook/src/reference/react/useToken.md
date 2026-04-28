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

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useToken } from "@zama-fhe/react-sdk";

function TokenActions() {
  const token = useToken({ tokenAddress: "0xToken" });

  async function handleAllow() {
    await token.allow();
    console.log("Session authorized");
  }

  async function handleTransfer() {
    const { txHash } = await token.confidentialTransfer("0xRecipient", 500n);
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

```ts
import { type UseZamaConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
const token = useToken({
  tokenAddress: "0xToken",
});
```

### wrapperAddress

`Address | undefined`

Explicit wrapper address. When omitted, the SDK resolves it automatically via the deployment coordinator.

```ts
const token = useToken({
  tokenAddress: "0xToken",
  wrapperAddress: "0xWrapper",
});
```

## Return Type

`Token`

A memoized `Token` instance with full read and write access. The reference stays the same as long as the input addresses do not change.

## Related

- [useReadonlyToken](/reference/react/useReadonlyToken) — read-only variant (no signing required)
- [useZamaSDK](/reference/react/useZamaSDK) — access the underlying SDK instance directly
- [Token](/reference/sdk/Token) — full API reference for the `Token` class
