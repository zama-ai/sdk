---
title: useConfidentialBalances
description: Decrypt and poll multiple tokens' confidential balances in a single query.
---

# useConfidentialBalances

Decrypt and poll multiple tokens' confidential balances in a single query. Returns a `BatchBalancesResult` with results and errors maps. Each token uses the same cached decryption strategy as [`useConfidentialBalance`](/reference/react/useConfidentialBalance).

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
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-relayer.example.com/v2",
  network: "https://your-rpc.example.com",
} as const satisfies FheChain;

export const zamaConfig = createConfig({
  chains: [mySepolia],
  relayers: { [mySepolia.id]: web() },
  wagmiConfig,
});
```

{% endtab %}
{% endtabs %}

## Parameters

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

### account

`Address | undefined`

Address whose balances to read. Defaults to the connected wallet address from the signer.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB"],
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

- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- single-token variant
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalances`
