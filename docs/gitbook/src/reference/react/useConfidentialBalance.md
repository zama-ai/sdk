---
title: useConfidentialBalance
description: Decrypt a single token's confidential balance.
---

# useConfidentialBalance

Decrypt a single token's confidential balance. Calls `token.balanceOf(owner)` which reads the encrypted value on-chain and decrypts it via the SDK. Cached clear values are served instantly — the expensive relayer round-trip only happens when the on-chain encrypted value changes. Pass `refetchInterval` to poll for updates.

## Import

```ts
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

function TokenBalance({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { address } = useAccount();
  const {
    data: balance,
    isLoading,
    error,
  } = useConfidentialBalance({ address: tokenAddress, account: address });

  if (isLoading) return <span>Decrypting...</span>;
  if (error) return <span>Error: {error.message}</span>;
  return <span>{balance?.toString()}</span>;
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
} as const satisfies FheChain;

export const zamaConfig = createConfig({
  chains: [mySepolia, myMainnet],
  relayers: { [mySepolia.id]: web(), [myMainnet.id]: web() },
  wagmiConfig,
});
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialBalanceConfig } from "@zama-fhe/react-sdk";
```

### address

`Address`

Contract address of the confidential token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalance({ address: "0xToken", account: address });
```

{% endtab %}
{% endtabs %}

---

### account

`Address | undefined`

Address whose balance to read. The query is disabled while `undefined`. Pass the connected wallet address from wagmi's `useAccount()`.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useAccount } from "wagmi";

const { address } = useAccount();
const { data } = useConfidentialBalance({ address: "0xToken", account: address });
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseConfidentialBalanceOptions } from "@zama-fhe/react-sdk";
```

The `data` property is `bigint | undefined` -- the decrypted token balance.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalances](./useConfidentialBalances.md) -- batch variant for multiple tokens
- [Check Balances guide](../../guides/check-balances.md)
- [Query Keys](./query-keys.md) -- `zamaQueryKeys.confidentialBalance`
