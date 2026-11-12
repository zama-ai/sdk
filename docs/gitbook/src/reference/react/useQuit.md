---
title: useQuit
description: Mutation hook that takes the signer's deposit back from a pending or canceled vault batch.
---

# useQuit

Mutation hook that takes the signer's deposit back from a pending or canceled batch. Wraps [`VaultClient.quit`](../sdk/VaultClient.md#quit). The signer must be the account that joined.

{% hint style="warning" %}
**Quit every leg of a group join, not only the chosen one.** Quitting one leg shows which vault the user picked. See [A group hides which vault you chose](../../guides/vaults/README.md#a-group-hides-which-vault-you-chose).
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

```ts
import { type UseVaultMutationOptions } from "@zama-fhe/react-sdk/vaults";
```

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A [`BatchRef`](../sdk/VaultClient.md#batchref), passed to `mutate` / `mutateAsync`.

### chainId

`number`

The chain of the batch to quit.

### batcher

`Address`

The batcher of the batch to quit.

### batchId

`bigint`

The batch to quit.

**Throws:**

- `ChainMismatchError`: the wallet is not on the batch's chain.
- `TransactionRevertedError`: the quit reverted, for example because the batch was dispatched in the meantime.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatch](./useBatch.md): when `quit` is available
- [useClaim](./useClaim.md): claim a finalized batch instead
