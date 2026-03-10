---
title: useConfidentialBalances
description: Decrypt and poll multiple tokens' confidential balances in a single query.
---

# useConfidentialBalances

Decrypt and poll multiple tokens' confidential balances in a single query. Returns a `Map` keyed by token address. Each token uses the same two-phase polling strategy as [`useConfidentialBalance`](/reference/react/useConfidentialBalance).

## Import

```ts
import { useConfidentialBalances } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialBalances } from "@zama-fhe/react-sdk";

function Portfolio({ tokens }: { tokens: `0x${string}`[] }) {
  const { data: balances, isLoading } = useConfidentialBalances({
    tokenAddresses: tokens,
  });

  if (isLoading) return <span>Decrypting...</span>;

  return (
    <ul>
      {tokens.map((addr) => (
        <li key={addr}>
          {addr}: {balances?.get(addr)?.toString() ?? "—"}
        </li>
      ))}
    </ul>
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
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
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

```ts
import { type UseConfidentialBalancesParameters } from "@zama-fhe/react-sdk";
```

### tokenAddresses

`Address[]`

Array of confidential ERC-20 token contract addresses to query.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});
```

{% endtab %}
{% endtabs %}

---

### owner

`Address | undefined`

Address whose balances to read. Defaults to the connected wallet address from the signer.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB"],
  owner: "0xOwner",
});
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseConfidentialBalancesReturnType } from "@zama-fhe/react-sdk";
```

The `data` property is `Map<Address, bigint> | undefined` -- a map from token address to decrypted balance.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- single-token variant
- [Two-Phase Polling](/concepts/two-phase-polling)
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalances`
