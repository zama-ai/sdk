---
title: useClaim
description: Mutation hook that claims a finalized vault batch's output for an account.
---

# useClaim

Mutation hook that claims a finalized batch with the SDK's signer. The batch pays the account's deposit at the batch's exchange rate: shares for a deposit batch, the asset for a redeem batch. Same flow as [`VaultClient.claim`](../sdk/VaultClient.md#claim).

Anyone may claim, and the output always goes to `account`, never to the sender. A keeper (an off-chain service that watches batches) normally claims for every depositor, so the user only waits. Offer this hook as a fallback when `claim` stays in a batch's `actions` longer than your app expects.

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

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

A `BatchRef` plus an optional `account`, passed to `mutate` / `mutateAsync`.

### chainId, batcher, batchId

`number`, `Address`, `bigint`

The batch to claim.

### account

`Address | undefined`

The account to claim for. Defaults to the signer.

A claimed deposit becomes an encrypted zero, and the batch still lists `claim` afterwards. Claiming again moves nothing.

**Throws:**

- `ChainMismatchError`: the wallet is not on the batch's chain.
- `TransactionRevertedError`: the claim reverted, for example because the batch is not finalized yet. Check `actions` before you send.

## Return Type

The `data` property (after a successful mutation) is a `TransactionResult`: `{ txHash, receipt }`.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useBatch](./useBatch.md): when `claim` is available
- [useQuit](./useQuit.md): take a deposit back instead
- [VaultClient.claim](../sdk/VaultClient.md#claim)
