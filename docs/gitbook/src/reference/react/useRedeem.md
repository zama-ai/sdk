---
title: useRedeem
description: Mutation hook that redeems confidential vault shares by joining the current redeem batch.
---

# useRedeem

Mutation hook that redeems a plaintext amount of shares from a confidential vault. It grants the redeem batcher an ERC-7984 operator approval on the share token if one isn't already active, checks the caller's share balance, encrypts the amount, and joins the currently open redeem batch — the same flow as [`Vault.redeem`](../sdk/Vault.md#redeem).

The amount is denominated in **shares**, never in assets — ERC-4626 `redeem`, not `withdraw`. The vault settles the batch into the underlying asset at the batch's exchange rate; claim the proceeds with [`useClaim`](./useClaim.md) on the redeem batcher once the batch is `Finalized`.

## Import

```ts
import { useRedeem } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="RedeemButton.tsx" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";

const addresses = { depositBatcher: "0xDepositBatcher", redeemBatcher: "0xRedeemBatcher" } as const;

function RedeemButton() {
  const { mutateAsync: redeem, isPending } = useRedeem({ addresses });

  async function handleRedeem() {
    const { batchId } = await redeem({ amount: 500n });
    console.log("Joined redeem batch", batchId);
  }

  return (
    <button onClick={handleRedeem} disabled={isPending}>
      {isPending ? "Redeeming..." : "Redeem"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseRedeemConfig } from "@zama-fhe/react-sdk/vaults";
```

### addresses

`VaultAddresses`

The vault's `depositBatcher` and `redeemBatcher` addresses, and optionally the `vault` contract for cross-checking. Same shape as [`useVault`](./useVault.md) takes.

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type RedeemParams } from "@zama-fhe/sdk/vaults";
```

### amount

`bigint`

Number of shares to redeem, in the share token's base units (`vault.cShare().decimals()`).

```ts
await redeem({ amount: 500n });
```

### beneficiary

`Address | undefined`

Default: the connected wallet. The account credited in the batch; it owns the position and receives the claimed assets.

### operatorUntil

`number | undefined`

Default: now + 1 hour. Unix timestamp (seconds) until which the batcher's operator grant on the share token is valid. Only used when a grant isn't already active.

### skipBalanceCheck

`boolean | undefined`

Default: `false`. Skips the share-balance pre-flight, for accounts whose balance the connected signer can't decrypt.

**Throws:**

- `ConfigurationError` — the two batchers report different vaults, or disagree with a configured `vault` address
- `InsufficientConfidentialBalanceError` — the share balance is less than `amount`
- `BalanceCheckUnavailableError` — the balance check needs a decryption the signer can't perform

## Return Type

`data` resolves to a `JoinResult`: `{ txHash, receipt, batchId, beneficiary, confidentialJoinedAmount }`. See [`Vault` → JoinResult](../sdk/Vault.md#joinresult).

On success the hook invalidates the share token's balance cache, the redeem batcher's batch reads, and the share token's operator-status cache.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md) — the deposit direction
- [useClaim](./useClaim.md) — claim the assets once the batch is finalized
- [Vault.redeem](../sdk/Vault.md#redeem) — imperative equivalent on the `Vault` class
- [Vault deposits and redemptions](../../guides/vault-deposits.md#redemptions)
