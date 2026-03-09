---
title: useBatchTransferFee
description: Query hook that reads the batch transfer fee from a fee manager contract.
---

# useBatchTransferFee

Query hook that reads the batch transfer fee from a fee manager contract.

## Import

```ts
import { useBatchTransferFee } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useBatchTransferFee } from "@zama-fhe/react-sdk";

function BatchFeeDisplay() {
  const { data: fee, isLoading, error } = useBatchTransferFee("0xFeeManager"); // [!code focus]

  if (isLoading) return <span>Loading fee...</span>;
  if (error) return <span>Failed to load fee</span>;

  return <span>Batch transfer fee: {fee?.toString()}</span>;
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
const { data: fee } = useBatchTransferFee(
  "0xFeeManager", // [!code focus]
);
```

## Return Type

Standard `UseQueryResult` where `data` is `bigint` — the batch transfer fee amount.

## Related

- [useFeeRecipient](/reference/react/useFeeRecipient) — read the fee recipient address from the same contract
- [Hooks: Fees](/reference/react/useShieldFee) — overview of all fee hooks
