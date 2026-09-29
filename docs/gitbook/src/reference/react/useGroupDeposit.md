---
title: useGroupDeposit
description: Mutation hook that deposits into one vault of a group by joining every member's current deposit batch.
---

# useGroupDeposit

Mutation hook that deposits a plaintext amount into one member of a [vault group](../../guides/vault-groups.md). It checks the caller's confidential balance, resolves every member's active deposit batcher, and joins all of them — the chosen vault with the amount, the rest with an encrypted zero — the same flow as [`VaultGroup.deposit`](../sdk/VaultGroup.md#deposit).

The deposit is not settled when the mutation resolves: it has joined a batch on every member. Keep the returned `joins` and follow each one with [`useBatchState`](./useBatchState.md), then [`useClaim`](./useClaim.md) once it is `Finalized`.

## Import

```ts
import { useGroupDeposit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DepositButton.tsx" %}

```tsx
import { useGroupDeposit } from "@zama-fhe/react-sdk/vaults";
import { STABLE_GROUP } from "./group";

function DepositButton() {
  const { mutateAsync: deposit, isPending } = useGroupDeposit({ group: STABLE_GROUP });

  async function handleDeposit() {
    const { joins } = await deposit({ vaultId: "alpha", amount: 1_000_000n });
    const mine = joins.find((join) => join.vaultId === "alpha");
    console.log(`Joined batch ${mine?.batchId} on ${mine?.batcher}`);
  }

  return (
    <button onClick={handleDeposit} disabled={isPending}>
      {isPending ? "Depositing..." : "Deposit"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseGroupDepositConfig } from "@zama-fhe/react-sdk/vaults";
```

### group

`VaultGroupConfig`

The group to deposit into. Same shape as [`useVaultGroup`](./useVaultGroup.md) takes; keep its identity stable across renders.

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type GroupDepositParams } from "@zama-fhe/sdk/vaults";
```

Passed to `mutate` / `mutateAsync` at call time.

### vaultId

`string`

The member to deposit into — one of the group's configured ids.

### amount

`bigint`

Amount to deposit, in the shared asset token's base units.

### operatorUntil

`number | undefined`

Default: now + 1 hour. Unix timestamp (seconds) until which an operator grant made for this submission is valid. Only used when a grant isn't already active.

### skipBalanceCheck

`boolean | undefined`

Default: `false`. Skips the confidential-balance pre-flight, for accounts whose balance the connected signer can't decrypt (smart wallets). Without the check, a too-large deposit joins every batch with nothing.

**Throws:**

- `ConfigurationError` — unknown `vaultId`, or a batcher that reports a different token or vault than the member is configured with
- `InsufficientConfidentialBalanceError` — the asset balance is less than `amount`
- `BalanceCheckUnavailableError` — the balance check needs a decryption the signer can't perform
- `UnlistedConfidentialTokenError` — the router's registry does not list the asset

## Return Type

```ts
import { type VaultGroupJoinResult } from "@zama-fhe/sdk/vaults";
```

`data` resolves to a `VaultGroupJoinResult`: `{ vaultId, transactions, joins }`, with one entry in `joins` per member. See [`VaultGroup` → VaultGroupJoinResult](../sdk/VaultGroup.md#vaultgroupjoinresult).

On success the hook invalidates the asset token's balance and operator-status caches, and the batch reads (`useCurrentBatchId`, `useBatchState`, `useTimeUntilDispatchable`) of every batcher a leg joined.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useGroupRedeem](./useGroupRedeem.md) — the redeem direction
- [useBatchState](./useBatchState.md) / [useClaim](./useClaim.md) — follow and settle each batch you joined
- [VaultGroup.deposit](../sdk/VaultGroup.md#deposit) — imperative equivalent on the `VaultGroup` class
- [Vault groups](../../guides/vault-groups.md)
