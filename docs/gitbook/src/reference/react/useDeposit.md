---
title: useDeposit
description: Mutation hook that deposits into a confidential vault group and returns the join record to store.
---

# useDeposit

Mutation hook that deposits a plaintext amount of a group's asset. It checks the balance, encrypts the amount, and joins the open batch of every vault of the group: the chosen vault with the amount, the others with an encrypted zero. Same flow as [`VaultClient.deposit`](../sdk/VaultClient.md#deposit).

The deposit is not settled when the mutation resolves: it has joined a batch. Store the returned `record` and follow it with [`usePosition`](./usePosition.md).

## Import

```ts
import { useDeposit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DepositButton.tsx" %}

```tsx
import { useDeposit } from "@zama-fhe/react-sdk/vaults";
import { VAULTS } from "./vaults";

function DepositButton() {
  const deposit = useDeposit(VAULTS, { onSuccess: ({ record }) => saveRecord(record) });

  return (
    <button
      disabled={deposit.isPending}
      onClick={() => deposit.mutate({ groupId: "stable", vaultId: "beta", amount: 1_000_000n })}
    >
      {deposit.isPending ? "Depositing..." : "Deposit"}
    </button>
  );
}
```

{% endtab %}
{% tab title="vaults.ts" %}

```ts
import { defineVaults } from "@zama-fhe/sdk/vaults";

export const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0xConfidentialUSDC",
      vaults: {
        alpha: { depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
        beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
      },
    },
  },
});
```

{% endtab %}
{% endtabs %}

`saveRecord` stands in for your own storage. See [Store the join record](../../guides/vaults/deposits.md#4-store-the-join-record).

## Parameters

### config

`VaultsConfig`

The config returned by [`defineVaults`](../sdk/VaultClient.md#definevaults).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### groupId

`string`

The group to join. Typed to the config's group ids.

### vaultId

`string`

The vault that gets the amount. Required in a group of several vaults, optional in a group of one.

### amount

`bigint`

The amount, in the asset's base units. Encrypted before it leaves the SDK.

### beneficiary

`Address | undefined`

Only in a group of one. The account the batcher credits instead of the sender. The batcher then pulls the amount, so the hook first grants it an operator approval if none is active. The beneficiary owns the position.

### options

`JoinOptions | undefined`

- `onJoinSubmitted: (txHash: Hex) => void`: called once the wallet has sent the join, before the SDK waits for the receipt. Use it to move the UI from "Confirm in your wallet" to "Waiting for the transaction".
- `skipChecks: ("balance" | "config")[]`: skip the balance check, or the one-time check of the config against the chain.
- `grantValiditySeconds: number`: how long an operator grant lasts. Defaults to `3600`.

```tsx
deposit.mutate({
  groupId: "stable",
  vaultId: "beta",
  amount: 1_000_000n,
  options: { onJoinSubmitted: (txHash) => console.log("Sent", txHash) },
});
```

**Throws:**

- `VaultBatcherPausedError`: a batcher of the group is paused
- `UnlistedConfidentialTokenError`: the router's registry does not list the asset (multi-vault groups)
- `InsufficientConfidentialBalanceError`: the balance is less than `amount`
- `BalanceCheckUnavailableError`: the balance check cannot decrypt the balance
- `VaultJoinUnconfirmedError`: the join was mined, but the SDK could not read every batch id from the receipt
- `ChainMismatchError`: the wallet is not on the config's chain
- `ConfigurationError`: the config does not match the chain, or the provider is not on the config's chain

## Return Type

The `data` property (after a successful mutation) is a `JoinOutcome`:

- **`record`**: the `JoinRecord` to store. You need it to read and exit the position.
- **`txHashes`**: every transaction sent, grants first.

On success, the hook invalidates every vault read of the group and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useRedeem](./useRedeem.md): the redeem direction
- [usePosition](./usePosition.md): follow the join
- [VaultClient.deposit](../sdk/VaultClient.md#deposit)
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
