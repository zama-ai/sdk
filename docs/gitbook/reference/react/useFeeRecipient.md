---
title: useFeeRecipient
description: Query hook that reads the fee recipient address from a fee manager contract.
---

# useFeeRecipient

Query hook that reads the fee recipient address from a fee manager contract.

## Import

```ts
import { useFeeRecipient } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useFeeRecipient } from "@zama-fhe/react-sdk";

function FeeRecipientDisplay() {
  const { data: recipient, isLoading, error } = useFeeRecipient("0xFeeManager"); // [!code focus]

  if (isLoading) return <span>Loading...</span>;
  if (error) return <span>Failed to load recipient</span>;

  return <span>Fee recipient: {recipient}</span>;
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

### feeManagerAddress

`Address`

Address of the fee manager contract to query.

```ts
const { data: recipient } = useFeeRecipient(
  "0xFeeManager", // [!code focus]
);
```

## Return Type

Standard `UseQueryResult` where `data` is `Address` — the address that receives collected fees.

## Related

- [useBatchTransferFee](/reference/react/useBatchTransferFee) — read the batch transfer fee from the same contract
- [Hooks: Fees](/reference/react/useShieldFee) — overview of all fee hooks
