---
title: useDeposit
description: Mutation hook that deposits into a confidential vault group and returns the batch each leg landed in.
---

# useDeposit

Mutation hook that deposits a plaintext amount of a group's asset with the SDK's signer. It checks the balance, encrypts the amount, and joins the open batch of every vault of the group: the chosen vault with the amount, the others with an encrypted zero. Same flow as [`VaultClient.deposit`](../sdk/VaultClient.md#deposit).

The deposit is not settled when the mutation resolves: it has joined a batch. Store the returned `batches` and follow them with [`useBatch`](./useBatch.md).

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
import { defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  vaults: [
    {
      id: "alpha",
      batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
      share: "0xAlphaShare",
    },
    {
      id: "beta",
      batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
      share: "0xBetaShare",
    },
  ],
});
```

{% endtab %}
{% endtabs %}

`saveBatches` stands in for your own storage. See [Store the batches](../../guides/vaults/deposits.md#4-store-the-batches).

## Parameters

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### group

`VaultGroup`

The group to join, as returned by [`defineVaultGroup`](../sdk/VaultClient.md#definevaultgroup).

### vaultId

`string`

The vault that gets the amount.

### amount

`bigint`

The amount, in the asset's base units. Encrypted before it leaves the SDK.

### skipChecks

`("balance" | "config")[] | undefined`

Skip the balance check, or the one-time check of the group against the chain. The paused check always runs.

### onJoinSubmitted

`((txHash: Hex) => void) | undefined`

Called once the wallet has sent the join, before the SDK waits for the receipt. Use it to move the UI from "Confirm in your wallet" to "Waiting for the transaction".

```tsx
deposit.mutate({
  group: STABLE,
  vaultId: "beta",
  amount: 1_000_000n,
  onJoinSubmitted: (txHash) => console.log("Sent", txHash),
});
```

**Throws:**

- `VaultBatcherPausedError`: a batcher of the group is paused
- `UnlistedConfidentialTokenError`: the router's registry does not list the asset (multi-vault groups)
- `InsufficientConfidentialBalanceError`: the balance is less than `amount`
- `BalanceCheckUnavailableError`: the balance check cannot decrypt the balance
- `VaultJoinUnconfirmedError`: the join was mined, but the SDK could not read every batch id from the receipt
- `ChainMismatchError`: the wallet is not on the group's chain
- `ConfigurationError`: the group does not match the chain

## Return Type

The `data` property (after a successful mutation) is a `JoinOutcome`:

- **`batches`**: the batch each leg landed in, in group order, as `{ vaultId, chainId, batcher, batchId }`. Store them to read, claim or quit later.
- **`prepared`**: the `PreparedJoin` that was sent.
- **`txHashes`**: every transaction sent, grants first.

On success, the hook invalidates every vault read and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useRedeem](./useRedeem.md): the redeem direction
- [useBatch](./useBatch.md): follow each batch
- [VaultClient.deposit](../sdk/VaultClient.md#deposit)
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
