---
title: useClaim
description: Mutation hook that claims a finalized vault batch's output for an account.
---

# useClaim

Mutation hook that claims a finalized batch with the SDK's signer: shares for a deposit batch, the asset for a redeem batch. Wraps [`VaultClient.claim`](../sdk/VaultClient.md#claim).

Any account may send the claim. The output goes to `account`.

## Import

```ts
import { useClaim } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="ClaimButton.tsx" %}

```tsx
import { useBatch, useClaim } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";
import type { Address } from "viem";

function ClaimButton({ batchRef, account }: { batchRef: BatchRef; account: Address }) {
  const { data: batch } = useBatch(batchRef, { account });
  const claim = useClaim();

  if (!batch?.actions.includes("claim")) return null;

  return (
    <button disabled={claim.isPending} onClick={() => claim.mutate({ ...batchRef, account })}>
      {claim.isPending ? "Claiming..." : "Claim"}
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

A [`BatchRef`](../sdk/VaultClient.md#batchref) plus an optional `account`, passed to `mutate` / `mutateAsync`.

### chainId

`number`

The chain of the batch to claim.

### batcher

`Address`

The batcher of the batch to claim.

### batchId

`bigint`

The batch to claim.

### account

`Address | undefined`

The account to claim for. Defaults to the signer.

**Throws:**

- `ChainMismatchError`: the wallet is not on the batch's chain.
- `TransactionRevertedError`: the claim reverted, for example because the batch is not finalized yet.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatch](./useBatch.md): when `claim` is available
- [useQuit](./useQuit.md): take a deposit back instead
