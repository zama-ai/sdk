---
title: useGroupRedeem
description: Mutation hook that redeems shares of one vault of a group by joining every member's current redeem batch.
---

# useGroupRedeem

Mutation hook that redeems a plaintext amount of shares from one member of a [vault group](../../guides/vault-groups.md). It checks the caller's balance of that member's share token, resolves every member's active redeem batcher, and joins all of them, each leg spending its own vault's share token — the same flow as [`VaultGroup.redeem`](../sdk/VaultGroup.md#redeem).

The router pulls each share token, so the SDK grants it an operator approval on every member's share token that lacks one before the join. Each grant is its own wallet prompt: a first redemption from a group of N vaults can ask the user to sign up to N + 1 times.

## Import

```ts
import { useGroupRedeem } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="RedeemButton.tsx" %}

```tsx
import { useGroupRedeem } from "@zama-fhe/react-sdk/vaults";
import { STABLE_GROUP } from "./group";

function RedeemButton() {
  const { mutateAsync: redeem, isPending } = useGroupRedeem({ group: STABLE_GROUP });

  return (
    <button onClick={() => redeem({ vaultId: "alpha", amount: 500n })} disabled={isPending}>
      {isPending ? "Redeeming..." : "Redeem"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseGroupRedeemConfig } from "@zama-fhe/react-sdk/vaults";
```

### group

`VaultGroupConfig`

The group to redeem from. Same shape as [`useVaultGroup`](./useVaultGroup.md) takes.

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type GroupRedeemParams } from "@zama-fhe/sdk/vaults";
```

### vaultId

`string`

The member to redeem from — one of the group's configured ids.

### amount

`bigint`

Amount of **shares** to redeem, in that member's share token's base units. ERC-4626 `redeem`, not `withdraw`.

### operatorUntil, skipBalanceCheck

Same as [`useGroupDeposit`](./useGroupDeposit.md#operatoruntil). The balance check is against the chosen member's share token.

**Throws:** the same errors as `useGroupDeposit`, including `VaultBatcherPausedError`, except `UnlistedConfidentialTokenError`, which only the deposit path raises.

## Return Type

`data` resolves to a `VaultGroupJoinResult` — see [`VaultGroup` → VaultGroupJoinResult](../sdk/VaultGroup.md#vaultgroupjoinresult).

On success the hook invalidates every member's share balance and operator-status caches — each leg transferred its own share token, even where the amount moved was zero — and the batch reads of every batcher a leg joined.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useGroupDeposit](./useGroupDeposit.md) — the deposit direction
- [VaultGroup.redeem](../sdk/VaultGroup.md#redeem) — imperative equivalent on the `VaultGroup` class
- [Vault groups](../../guides/vault-groups.md)
