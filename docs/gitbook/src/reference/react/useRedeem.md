---
title: useRedeem
description: Mutation hook that redeems confidential vault shares and returns the join record to store.
---

# useRedeem

Mutation hook that redeems a plaintext amount of a vault's shares. It checks the share balance, encrypts the amount, and joins the open redeem batch of every vault of the group: the chosen vault with the amount, the others with an encrypted zero. Same flow as [`VaultClient.redeem`](../sdk/VaultClient.md#redeem).

Store the returned `record` and follow it with [`usePosition`](./usePosition.md). Exiting a settled redemption pays out the asset.

{% hint style="warning" %}
**In a group of N vaults, a redemption can take up to N + 1 wallet prompts.** The router pulls each vault's share token, so the account first grants it an operator approval on every share token it has not granted yet, then sends the join. Grants last `grantValiditySeconds` (one hour by default), so a redemption after they expire asks for them again. Tell users before they start. See [Wallet prompts](../../guides/vaults/groups.md#wallet-prompts).
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
import { VAULTS } from "./vaults";

function RedeemButton() {
  const redeem = useRedeem(VAULTS, { onSuccess: ({ record }) => saveRecord(record) });

  return (
    <button
      disabled={redeem.isPending}
      onClick={() => redeem.mutate({ groupId: "stable", vaultId: "beta", amount: 500n })}
    >
      {redeem.isPending ? "Redeeming..." : "Redeem"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### config

`VaultsConfig`

The config returned by [`defineVaults`](../sdk/VaultClient.md#definevaults).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Same as [`useDeposit`](./useDeposit.md#mutation-variables): `groupId`, `vaultId`, `amount`, `beneficiary` (group of one only) and `options`. The `amount` is in shares, not assets.

```tsx
redeem.mutate({
  groupId: "stable",
  vaultId: "beta",
  amount: 500n,
  options: { grantValiditySeconds: 86_400 },
});
```

**Throws:** as [`useDeposit`](./useDeposit.md#mutation-variables), except `UnlistedConfidentialTokenError`, which only applies to deposits.

## Return Type

The `data` property (after a successful mutation) is a `JoinOutcome`:

- **`record`**: the `JoinRecord` to store.
- **`txHashes`**: every transaction sent, grants first.

On success, the hook invalidates every vault read of the group and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md): the deposit direction
- [usePosition](./usePosition.md): follow the join
- [VaultClient.redeem](../sdk/VaultClient.md#redeem)
- [Vault groups](../../guides/vaults/groups.md)
