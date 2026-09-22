---
title: useRecover
description: Mutation hook that refunds a depositor's deposit from a canceled vault batch on their behalf.
---

# useRecover

Mutation hook that refunds an account's deposit in a **canceled** batch. Same call as [`VaultBatcher.recover`](../sdk/VaultBatcher.md#recover).

Recovering is permissionless: anyone can call it, and the refund always goes to the depositor, never to the caller. That lets a keeper, or the app itself, clean up a canceled batch on behalf of users who joined for a `beneficiary` and would otherwise have to come back and quit themselves. Before a batch is canceled, a participant undoes their own join with [`useQuit`](./useQuit.md).

## Import

```ts
import { useRecover } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="RecoverButton.tsx" %}

```tsx
import { useRecover } from "@zama-fhe/react-sdk/vaults";

function RecoverButton({ batchId, depositor }: { batchId: bigint; depositor: `0x${string}` }) {
  const { mutate: recover, isPending } = useRecover({ address: "0xDepositBatcher" });

  return (
    <button onClick={() => recover({ batchId, account: depositor })} disabled={isPending}>
      {isPending ? "Recovering..." : "Recover deposit"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseRecoverConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type RecoverParams } from "@zama-fhe/sdk/vaults";
```

### batchId

`bigint`

The canceled batch holding the deposit.

### account

`Address | undefined`

Default: the connected wallet. The depositor to refund.

```ts
recover({ batchId, account: "0xDepositor" });
```

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }`.

On success the hook invalidates the input token's balance cache and the batcher's batch reads.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useQuit](./useQuit.md) — withdraw your own deposit, also from a pending batch
- [useBatchState](./useBatchState.md) — `recover` is only legal on `Canceled`
- [VaultBatcher.recover](../sdk/VaultBatcher.md#recover) — imperative equivalent
