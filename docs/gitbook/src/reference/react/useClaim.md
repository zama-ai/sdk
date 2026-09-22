---
title: useClaim
description: Mutation hook that claims a finalized vault batch's output for an account.
---

# useClaim

Mutation hook that claims a finalized batch's output — shares for a deposit batcher, assets for a redeem batcher. Same call as [`VaultBatcher.claim`](../sdk/VaultBatcher.md#claim).

Claiming is permissionless: anyone can call it on another account's behalf, and the output always goes to that account, never to the caller. It is only legal once the batch reaches `BatchState.Finalized`; claiming a canceled batch reverts, use [`useQuit`](./useQuit.md) or [`useRecover`](./useRecover.md) instead.

## Import

```ts
import { useClaim } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="ClaimButton.tsx" %}

```tsx
import { BatchState } from "@zama-fhe/sdk/vaults";
import { useBatchState, useClaim } from "@zama-fhe/react-sdk/vaults";

function ClaimButton({ batchId }: { batchId: bigint }) {
  const { data: state } = useBatchState({ address: "0xDepositBatcher", batchId });
  const { mutate: claim, isPending } = useClaim({ address: "0xDepositBatcher" });

  return (
    <button
      onClick={() => claim({ batchId })}
      disabled={isPending || state !== BatchState.Finalized}
    >
      {isPending ? "Claiming..." : "Claim"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseClaimConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type ClaimParams } from "@zama-fhe/sdk/vaults";
```

### batchId

`bigint`

The finalized batch to claim from.

### account

`Address | undefined`

Default: the connected wallet. The account to claim for. The output goes to this account regardless of who submits the transaction.

```ts
claim({ batchId });
claim({ batchId, account: "0xSomeoneElse" });
```

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }`. The claimed amount is not returned — read it as a balance on the batcher's output token with [`useConfidentialBalance`](./useConfidentialBalance.md).

On success the hook invalidates the output token's balance cache.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatchState](./useBatchState.md) — gate the button on `Finalized`
- [useQuit](./useQuit.md) / [useRecover](./useRecover.md) — what to do with a canceled batch instead
- [VaultBatcher.claim](../sdk/VaultBatcher.md#claim) — imperative equivalent
