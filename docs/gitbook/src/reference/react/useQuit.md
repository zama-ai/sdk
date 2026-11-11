---
title: useQuit
description: Mutation hook that takes the signer's deposit back from a pending or canceled vault batch.
---

# useQuit

Mutation hook that takes the signer's deposit back from a pending batch, or from a canceled one. Same flow as [`VaultClient.quit`](../sdk/VaultClient.md#quit).

The contract refunds the sender, so only the depositor can quit. The wallet must be the account that joined.

{% hint style="warning" %}
**Quit every leg of the join, not only the chosen one.** A join sends a leg to every vault of its group, which is what hides the choice. A quit is public, so quitting only the chosen vault's batch shows which vault the user picked. To cancel a join in a group, quit the batch of every leg in `batches`: one wallet prompt each. A canceled batch rarely needs a quit: a keeper recovers the deposit for every depositor anyway.
{% endhint %}

## Import

```ts
import { useQuit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="CancelJoinButton.tsx" %}

```tsx
import { useQuit } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";

function CancelJoinButton({ batches }: { batches: readonly BatchRef[] }) {
  const quit = useQuit();

  async function handleClick() {
    for (const batch of batches) {
      await quit.mutateAsync(batch);
    }
  }

  return (
    <button disabled={quit.isPending} onClick={handleClick}>
      {quit.isPending ? "Cancelling..." : "Cancel and get it back"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

`batches` are the batches of every leg of one join, as returned by [`useDeposit`](./useDeposit.md) or [`useRedeem`](./useRedeem.md).

## Parameters

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A `BatchRef`, passed to `mutate` / `mutateAsync`.

### chainId, batcher, batchId

`number`, `Address`, `bigint`

The batch to quit.

A quit deposit becomes an encrypted zero, and the batch still lists `quit` afterwards. Quitting again moves nothing.

**Throws:**

- `ChainMismatchError`: the wallet is not on the batch's chain.
- `TransactionRevertedError`: the quit reverted, for example because the batch was dispatched in the meantime. Check `actions` before you send.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatch](./useBatch.md): when `quit` is available
- [useClaim](./useClaim.md): claim a finalized batch instead
- [VaultClient.quit](../sdk/VaultClient.md#quit)
