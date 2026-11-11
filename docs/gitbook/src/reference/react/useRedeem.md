---
title: useRedeem
description: Mutation hook that redeems confidential vault shares and returns the batch each leg landed in.
---

# useRedeem

Mutation hook that redeems a plaintext amount of a vault's shares with the SDK's signer. It checks the share balance, encrypts the amount, and joins the open redeem batch of every vault of the group: the chosen vault with the amount, the others with an encrypted zero. Same flow as [`VaultClient.redeem`](../sdk/VaultClient.md#redeem).

Store the returned `batches` and follow them with [`useBatch`](./useBatch.md). Claiming a finalized redemption pays out the asset.

{% hint style="warning" %}
**In a group of N vaults, a first redemption can take up to N + 1 wallet prompts.** The router pulls each vault's share token, so the account first grants it an operator approval on every share token it has not granted yet, then sends the join. A grant lasts a year, so later redemptions ask for none. Tell users before they start. See [Wallet prompts](../../guides/vaults/advanced.md#wallet-prompts).
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

Same as [`useDeposit`](./useDeposit.md#mutation-variables): `group` and `vaultId` or `vault`, `amount`, `skipChecks` and `onJoinSubmitted`. The `amount` is in shares, not assets.

**Throws:** as [`useDeposit`](./useDeposit.md#mutation-variables).

## Return Type

The `data` property (after a successful mutation) is a `JoinOutcome`:

- **`batches`**: the batch each leg landed in, in group order.
- **`prepared`**: the `PreparedJoin` that was sent.
- **`txHashes`**: every transaction sent, grants first.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md): the deposit direction
- [useBatch](./useBatch.md): follow each batch
- [VaultClient.redeem](../sdk/VaultClient.md#redeem)
- [Advanced vault integration](../../guides/vaults/advanced.md)
