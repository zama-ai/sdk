---
title: useDeposit
description: Mutation hook that deposits into a confidential vault group and returns the batch each leg landed in.
---

# useDeposit

Mutation hook that deposits into a vault group, or a vault on its own, with the SDK's signer. Wraps [`VaultClient.deposit`](../sdk/VaultClient.md#send-methods).

The mutation resolves once the deposit has joined a batch, not once it has settled. Store the returned `batches` and follow them with [`useBatch`](./useBatch.md).

## Import

```ts
import { useDeposit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DepositButton.tsx" %}

```tsx
import { useDeposit } from "@zama-fhe/react-sdk/vaults";
import { STABLE } from "./vaults";

function DepositButton() {
  const deposit = useDeposit({ onSuccess: ({ batches }) => saveBatches(batches) });

  return (
    <button
      disabled={deposit.isPending}
      onClick={() => deposit.mutate({ group: STABLE, vaultId: "beta", amount: 1_000_000n })}
    >
      {deposit.isPending ? "Depositing..." : "Deposit"}
    </button>
  );
}
```

{% endtab %}
{% tab title="vaults.ts" %}

```ts
import { defineVault, defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
});

export const BETA = defineVault({
  id: "beta",
  chainId: 1,
  batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
});

export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
```

{% endtab %}
{% endtabs %}

`saveBatches` stands in for your own storage. See [Store the batches](../../guides/vaults/deposits.md#4-store-the-batches).

## Parameters

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### group

`VaultGroup | undefined`

The group to join, as returned by [`defineVaultGroup`](../sdk/VaultClient.md#definevaultgroup). Pass `group` and `vaultId`, or `vault`.

### vault

`Vault | undefined`

A vault to join on its own instead of a group, as returned by [`defineVault`](../sdk/VaultClient.md#definevault). It takes no `vaultId`.

### vaultId

`string`

The vault that gets the amount.

### amount

`bigint`

The amount, in the asset's base units. Encrypted before it leaves the SDK.

### skipBalanceCheck

`boolean | undefined`

Skips the balance check, which runs by default.

### onJoinSubmitted

`((txHash: Hex) => void) | undefined`

Called once the wallet has sent the join, before the SDK waits for the receipt. See [The send](../../guides/vaults/building-a-ui.md#the-send).

**Throws:**

As [`VaultClient.deposit`](../sdk/VaultClient.md#send-methods). The ones a UI handles most:

- `VaultBatcherPausedError`: a batcher of the group is paused.
- `InsufficientConfidentialBalanceError`: the balance is below `amount`.
- `ChainMismatchError`: the wallet is not on the group's chain.
- `VaultJoinUnconfirmedError`: the join was mined, but the SDK could not read every batch from the receipt.

## Return Type

The `data` property (after a successful mutation) is a [`JoinOutcome`](../sdk/VaultClient.md#joinoutcome): `batches`, the batch each leg landed in, and `txHashes`.

When the mutation settles, successful or not, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useRedeem](./useRedeem.md): the redeem direction
- [useBatch](./useBatch.md): follow each batch
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
