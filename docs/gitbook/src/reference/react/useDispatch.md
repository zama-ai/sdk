---
title: useDispatch
description: Mutation hook that dispatches a vault batcher's open batch.
---

# useDispatch

Mutation hook that dispatches a batcher's open batch with the SDK's signer. Wraps [`VaultClient.dispatch`](../sdk/VaultClient.md#dispatch).

It dispatches whatever batch is open on the batcher. Any account may send it.

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

```ts
import { type UseVaultMutationOptions } from "@zama-fhe/react-sdk/vaults";
```

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A `BatcherRef`, passed to `mutate` / `mutateAsync`.

### chainId

`number`

The batcher's chain.

### batcher

`Address`

The batcher whose open batch is dispatched.

```tsx
dispatch.mutate({ chainId: batchRef.chainId, batcher: batchRef.batcher });
```

**Throws:**

- `ChainMismatchError`: the wallet is not on the batcher's chain.
- `TransactionRevertedError`: the dispatch reverted, for example because the batch is too young, the batcher is paused, or a keeper dispatched it first.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useFinalize](./useFinalize.md): the next step after dispatch
- [useBatch](./useBatch.md): when `dispatch` is available
