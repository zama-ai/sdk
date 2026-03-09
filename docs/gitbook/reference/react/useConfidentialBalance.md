---
title: useConfidentialBalance
description: Decrypt and poll a single token's confidential balance.
---

# useConfidentialBalance

Decrypt and poll a single token's confidential balance. Uses [two-phase polling](/concepts/two-phase-polling) -- cheaply checks the encrypted handle on-chain, only decrypts when it changes. Decrypted values are persisted in storage, so page reloads display the balance instantly.

## Import

```ts
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

function TokenBalance({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const {
    data: balance,
    isLoading,
    error,
  } = useConfidentialBalance({
    tokenAddress,
  });

  if (isLoading) return <span>Decrypting...</span>;
  if (error) return <span>Error: {error.message}</span>;
  return <span>{balance?.toString()}</span>;
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseConfidentialBalanceParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

::: code-group

```tsx [component.tsx]
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken", // [!code focus]
});
```

:::

---

### owner

`Address | undefined`

Address whose balance to read. Defaults to the connected wallet address from the signer.

::: code-group

```tsx [component.tsx]
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken",
  owner: "0xOwner", // [!code focus]
});
```

:::

### handleRefetchInterval

`number | undefined`

Polling interval in milliseconds for checking on-chain handle changes. Default: `10000` (10 seconds).

::: code-group

```tsx [component.tsx]
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken",
  handleRefetchInterval: 5_000, // [!code focus]
});
```

:::

<!--@include: @/shared/query-options.md-->

## Return Type

```ts
import { type UseConfidentialBalanceReturnType } from "@zama-fhe/react-sdk";
```

The `data` property is `bigint | undefined` -- the decrypted token balance.

<!--@include: @/shared/query-result.md-->

## Related

- [useConfidentialBalances](/reference/react/useConfidentialBalances) -- batch variant for multiple tokens
- [Two-Phase Polling](/concepts/two-phase-polling)
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalance`
