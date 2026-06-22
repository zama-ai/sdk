---
title: useConfidentialBalances
description: Decrypt and poll multiple tokens' confidential balances in a single query.
---

# useConfidentialBalances

Decrypt and poll multiple tokens' confidential balances in a single query. Returns a `BatchBalancesResult` with results and errors maps. Each token uses the same cached decryption strategy as [`useConfidentialBalance`](./useConfidentialBalance.md).

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
    addresses: tokens,
    account: "0xYourAddress",
  });

  if (isLoading) return <span>Decrypting...</span>;

  return (
    <ul>
      {tokens.map((addr) => (
        <li key={addr}>
          {addr}: {balances?.results.get(addr)?.toString() ?? "—"}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
// config.ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
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

### addresses

`Address[]`

Array of confidential token contract addresses to query.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  addresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
  account: address,
});
```

{% endtab %}
{% endtabs %}

---

### account

`Address | undefined`

Address whose balances to read. The query is disabled while `undefined`. Pass the connected wallet address from wagmi's `useAccount()`.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  addresses: ["0xTokenA", "0xTokenB"],
  account: "0xOwner",
});
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/query-options.md" %}

## Return Type

The `data` property is `BatchBalancesResult | undefined` -- an object with `results: Map<Address, bigint>` (successfully decrypted balances) and `errors: Map<Address, ZamaError>` (per-token errors).

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalance](./useConfidentialBalance.md) -- single-token variant
- [Check Balances guide](../../guides/check-balances.md)
- [Query Keys](./query-keys.md) -- `zamaQueryKeys.confidentialBalances`
