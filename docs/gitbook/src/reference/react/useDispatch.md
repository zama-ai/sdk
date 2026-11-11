---
title: useDispatch
description: Mutation hook that dispatches a vault batcher's open batch.
---

# useDispatch

Mutation hook that dispatches a batcher's open batch with the SDK's signer: it closes the batch and starts its decryption. Same flow as [`VaultClient.dispatch`](../sdk/VaultClient.md#dispatch).

Dispatch is permissionless, and a keeper (an off-chain service that watches batches) normally sends it. Most apps never need this hook. Use it as a fallback when a batch stays pending with `dispatch` in its `actions` longer than your app expects.

## Import

```ts
import { useDispatch } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DispatchButton.tsx" %}

```tsx
import { useBatch, useDispatch } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";

function DispatchButton({ batchRef }: { batchRef: BatchRef }) {
  const { data: batch } = useBatch(batchRef);
  const dispatch = useDispatch();

  if (!batch?.actions.includes("dispatch")) return null;

  return (
    <button
      disabled={dispatch.isPending}
      onClick={() => dispatch.mutate({ chainId: batchRef.chainId, batcher: batchRef.batcher })}
    >
      Send the batch now
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

`{ chainId, batcher }`, passed to `mutate` / `mutateAsync`. The hook dispatches the batcher's open batch, whatever its id. Any account may send it.

**Throws:**

- `ChainMismatchError`: the wallet is not on the batcher's chain.
- `TransactionRevertedError`: the dispatch reverted, for example because the batch is too young, the batcher is paused, or a keeper dispatched it first.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useFinalize](./useFinalize.md): the next step after dispatch
- [useBatch](./useBatch.md): when `dispatch` is available
- [VaultClient.dispatch](../sdk/VaultClient.md#dispatch)
