---
title: useFinalize
description: Mutation hook that settles a dispatched vault batch when its keeper has not.
---

# useFinalize

Mutation hook that settles a dispatched batch yourself. Same call as [`VaultBatcher.finalize`](../sdk/VaultBatcher.md#finalize): it publicly decrypts the batch's aggregate amount and hands the cleartext and its proof to the batcher, which executes the route.

A keeper, an off-chain service that watches batches, normally finalizes a batch after dispatch, so this is for a batch that has sat in `BatchState.Dispatched` longer than expected. Finalizing is permissionless. Past the batch's callback deadline (see [`useTimeUntilCallbackDeadline`](./useTimeUntilCallbackDeadline.md)) the same call cancels the batch instead of settling it, and its participants take their deposits back with [`useQuit`](./useQuit.md).

The call reads the batch state first and rejects with [`VaultBatchNotDispatchedError`](../sdk/errors.md#vaultbatchnotdispatchederror) when the batch is not `Dispatched`, for example because a keeper already finalized it.

## Import

```ts
import { useFinalize } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="FinalizeButton.tsx" %}

```tsx
import { BatchState } from "@zama-fhe/sdk/vaults";
import { useBatchState, useFinalize } from "@zama-fhe/react-sdk/vaults";

function FinalizeButton({ batchId }: { batchId: bigint }) {
  const { data: state } = useBatchState({ address: "0xDepositBatcher", batchId });
  const { mutate: finalize, isPending } = useFinalize({ address: "0xDepositBatcher" });

  return (
    <button
      onClick={() => finalize({ batchId })}
      disabled={isPending || state !== BatchState.Dispatched}
    >
      {isPending ? "Finalizing..." : "Finalize batch"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseFinalizeConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### chainId

`number | undefined`

Chain the batcher is on. Pass the same `chainId` as the read hooks: while the wallet is on another chain, the mutation fails with [`ChainMismatchError`](../sdk/errors.md#chainmismatcherror) instead of sending there.

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type FinalizeParams } from "@zama-fhe/sdk/vaults";
```

### batchId

`bigint`

The dispatched batch to settle.

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }`.

On success the hook invalidates the batcher's batch reads: the batch leaves `Dispatched` and gains an exchange rate, so `useBatchState` refetches.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatchState](./useBatchState.md) — only a `Dispatched` batch can be finalized
- [useTimeUntilCallbackDeadline](./useTimeUntilCallbackDeadline.md) — whether finalizing still settles the batch
- [useClaim](./useClaim.md) — the step after a batch is `Finalized`
- [VaultBatcher.finalize](../sdk/VaultBatcher.md#finalize) — imperative equivalent
