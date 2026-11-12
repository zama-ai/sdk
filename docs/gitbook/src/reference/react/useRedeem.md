---
title: useRedeem
description: Mutation hook that redeems confidential vault shares and returns the batch each leg landed in.
---

# useRedeem

Mutation hook that redeems a vault's shares with the SDK's signer. Wraps [`VaultClient.redeem`](../sdk/VaultClient.md#send-methods). Store the returned `batches` and follow them with [`useBatch`](./useBatch.md).

{% hint style="warning" %}
In a group of N vaults, a first redemption can take up to N + 1 wallet prompts. See [Wallet prompts](../../guides/vaults/advanced.md#wallet-prompts).
{% endhint %}

## Import

```ts
import { useRedeem } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="RedeemButton.tsx" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";
import { STABLE } from "./vaults";

function RedeemButton() {
  const redeem = useRedeem({ onSuccess: ({ batches }) => saveBatches(batches) });

  return (
    <button
      disabled={redeem.isPending}
      onClick={() => redeem.mutate({ group: STABLE, vaultId: "beta", amount: 500n })}
    >
      {redeem.isPending ? "Redeeming..." : "Redeem"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

`STABLE` is the group from [`useDeposit`](./useDeposit.md#usage).

## Parameters

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Same as [`useDeposit`](./useDeposit.md#mutation-variables): `group` and `vaultId` or `vault`, `amount`, `skipBalanceCheck` and `onJoinSubmitted`. The `amount` is in shares, not assets.

**Throws:** as [`useDeposit`](./useDeposit.md#mutation-variables).

## Return Type

The `data` property (after a successful mutation) is a [`JoinOutcome`](../sdk/VaultClient.md#joinoutcome): `batches`, the batch each leg landed in, and `txHashes`, approvals first.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md): the deposit direction
- [useBatch](./useBatch.md): follow each batch
- [Vault deposits and redemptions](../../guides/vaults/deposits.md#redeem)
