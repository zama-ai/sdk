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

::: code-group

```tsx [component.tsx]
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

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseConfidentialBalancesParameters } from "@zama-fhe/react-sdk";
```

### tokenAddresses

`Address[]`

Array of confidential ERC-20 token contract addresses to query.

::: code-group

```tsx [component.tsx]
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"], // [!code focus]
});
```

:::

---

### owner

`Address | undefined`

Address whose balances to read. Defaults to the connected wallet address from the signer.

::: code-group

```tsx [component.tsx]
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB"],
  owner: "0xOwner", // [!code focus]
});
```

:::

<!--@include: @/shared/query-options.md-->

## Return Type

```ts
import { type UseConfidentialBalancesReturnType } from "@zama-fhe/react-sdk";
```

The `data` property is `Map<Address, bigint> | undefined` -- a map from token address to decrypted balance.

<!--@include: @/shared/query-result.md-->

## Related

- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- single-token variant
- [Two-Phase Polling](/concepts/two-phase-polling)
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalances`
