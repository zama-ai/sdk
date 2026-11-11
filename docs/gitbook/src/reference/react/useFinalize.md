---
title: useFinalize
description: Mutation hook that settles a dispatched vault batch.
---

# useFinalize

Mutation hook that settles a dispatched batch with its publicly decrypted amount, using the SDK's signer. Same flow as [`VaultClient.finalize`](../sdk/VaultClient.md#finalize).

Finalizing is permissionless, and a keeper (an off-chain service that watches batches) normally sends it. Use this hook as a fallback when a batch stays dispatched longer than your app expects. Pick the delay yourself; the SDK does not decide when a keeper is late.

Past the batch's callback deadline (`cancelsAt`), the same call **cancels** the batch instead of settling it. The user then gets the amount back with a quit. Label the button accordingly. A redeem batcher whose vault settles redemptions asynchronously is the exception: once it has placed its redemption request, it keeps settling past the deadline.

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

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A `BatchRef` (`{ chainId, batcher, batchId }`), passed to `mutate` / `mutateAsync`. Any account may send it.

**Throws:**

- `VaultBatchNotDispatchedError`: the batch is not dispatched, for example because a keeper already finalized it. The error's `state` says which state it is in.
- `ChainMismatchError`: the wallet is not on the batch's chain.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md#dispatched): when to offer it
- [useClaim](./useClaim.md): claim once the batch is finalized
- [VaultClient.finalize](../sdk/VaultClient.md#finalize)
