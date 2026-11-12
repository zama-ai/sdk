---
title: useFinalize
description: Mutation hook that settles a dispatched vault batch.
---

# useFinalize

Mutation hook that settles a dispatched batch with the SDK's signer. Wraps [`VaultClient.finalize`](../sdk/VaultClient.md#finalize).

Any account may send it. Past the batch's `cancelsAt`, the same call cancels the batch instead of settling it.

## Import

```ts
import { useFinalize } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="SettleButton.tsx" %}

```tsx
import { useBatch, useFinalize } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";

function SettleButton({ batchRef }: { batchRef: BatchRef }) {
  const { data: batch } = useBatch(batchRef);
  const finalize = useFinalize();

  if (batch?.state !== "dispatched") return null;

  const pastDeadline = batch.cancelsAt <= batch.observedAt;

  return (
    <button disabled={finalize.isPending} onClick={() => finalize.mutate(batchRef)}>
      {pastDeadline ? "Cancel and get it back" : "Settle"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseVaultMutationOptions } from "@zama-fhe/react-sdk/vaults";
```

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A [`BatchRef`](../sdk/VaultClient.md#batchref), passed to `mutate` / `mutateAsync`.

### chainId

`number`

The chain of the batch to finalize.

### batcher

`Address`

The batcher of the batch to finalize.

### batchId

`bigint`

The batch to finalize.

```tsx
finalize.mutate({ chainId: 1, batcher: "0xAlphaDeposit", batchId: 7n });
```

**Throws:**

- `VaultBatchNotDispatchedError`: the batch is not dispatched, for example because a keeper already finalized it. The error's `state` says which state it is in.
- `ChainMismatchError`: the wallet is not on the batch's chain.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md#dispatched): when to offer it
- [useClaim](./useClaim.md): claim once the batch is finalized
