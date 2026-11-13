---
title: useRedeem
description: Mutation hook that redeems confidential vault shares and returns the batch each leg landed in.
---

# useRedeem

Mutation hook that redeems a vault's shares with the SDK's signer. Wraps [`VaultClient.redeem`](../sdk/VaultClient.md#redeem). [`useBatch`](./useBatch.md) reads each returned batch.

In a group, the mutation first asks the wallet for each operator approval of the router that the account lacks. See [Wallet prompts](../../guides/vaults/advanced.md#wallet-prompts).

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

{% include ".gitbook/includes/vaults-config.md" %}

`saveBatches` stands in for your own storage. See [Store the batches](../../guides/vaults/deposits.md#4-store-the-batches).

## Parameters

```ts
import { type UseVaultMutationOptions } from "@zama-fhe/react-sdk/vaults";
```

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Same as [`useDeposit`](./useDeposit.md#mutation-variables): `group` and `vaultId` or `vault`, `amount`, `skipBalanceCheck` and `onJoinSubmitted`. The `amount` is in shares, not assets. As in `useDeposit`, `vaultId` is typed as `string`.

**Throws:** as [`useDeposit`](./useDeposit.md#mutation-variables).

## Return Type

The `data` property (after a successful mutation) is a [`JoinOutcome`](../sdk/VaultClient.md#joinoutcome): `batches`, the batch each leg landed in, and `txHashes`, approvals first.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md): the deposit direction
- [useBatch](./useBatch.md): follow each batch
- [Vault deposits and redemptions](../../guides/vaults/deposits.md#redeem)
