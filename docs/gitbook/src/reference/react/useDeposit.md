---
title: useDeposit
description: Mutation hook that deposits into a confidential ERC-4626 vault by joining the current deposit batch.
---

# useDeposit

Mutation hook that deposits a plaintext amount into a confidential vault. It encrypts the amount, grants the deposit batcher an ERC-7984 operator approval if one isn't already active, checks the caller's confidential balance, and joins the currently open deposit batch — the same flow as [`Vault.deposit`](../sdk/Vault.md#deposit).

The deposit is not settled when the mutation resolves: it has joined a batch. Keep the returned `batchId` and follow the batch with [`useBatchState`](./useBatchState.md), then [`useClaim`](./useClaim.md) once it is `Finalized`.

## Import

```ts
import { useDeposit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DepositButton.tsx" %}

```tsx
import { useDeposit } from "@zama-fhe/react-sdk/vaults";

const addresses = { depositBatcher: "0xDepositBatcher", redeemBatcher: "0xRedeemBatcher" } as const;

function DepositButton() {
  const { mutateAsync: deposit, isPending, error } = useDeposit({ addresses });

  async function handleDeposit() {
    const { txHash, batchId } = await deposit({ amount: 1_000_000n });
    console.log(`Joined batch ${batchId} in ${txHash}`);
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
import { type UseDepositConfig } from "@zama-fhe/react-sdk/vaults";
```

### addresses

`VaultAddresses`

The vault's `depositBatcher` and `redeemBatcher` addresses, and optionally the `vault` contract for cross-checking. Same shape as [`useVault`](./useVault.md) takes.

```ts
const { mutateAsync: deposit } = useDeposit({ addresses });
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type DepositParams } from "@zama-fhe/sdk/vaults";
```

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Amount to deposit, in the confidential asset token's base units (`vault.cAsset().decimals()`).

```ts
await deposit({ amount: 1_000_000n });
```

### beneficiary

`Address | undefined`

Default: the connected wallet. The account credited in the batch. The beneficiary owns the position — only they can quit it, and `claim` always pays out to them.

```ts
await deposit({ amount: 1_000_000n, beneficiary: "0xRecipient" });
```

### operatorUntil

`number | undefined`

Default: now + 1 hour. Unix timestamp (seconds) until which the batcher's operator grant on the asset token is valid. Only used when a grant isn't already active.

### skipBalanceCheck

`boolean | undefined`

Default: `false`. Skips the confidential-balance pre-flight, for accounts whose balance the connected signer can't decrypt (smart wallets). Without the check, a too-large deposit succeeds on-chain and joins nothing — decrypt `confidentialJoinedAmount` from the result to confirm.

```ts
await deposit({ amount: 1_000_000n, skipBalanceCheck: true });
```

**Throws:**

- `ConfigurationError` — the two batchers report different vaults, or disagree with a configured `vault` address
- `InsufficientConfidentialBalanceError` — the confidential asset balance is less than `amount`
- `BalanceCheckUnavailableError` — the balance check needs a decryption the signer can't perform

## Return Type

```ts
import { type JoinResult } from "@zama-fhe/sdk/vaults";
```

`data` resolves to a `JoinResult`: `{ txHash, receipt, batchId, beneficiary, confidentialJoinedAmount }`. See [`Vault` → JoinResult](../sdk/Vault.md#joinresult).

On success the hook invalidates the asset token's balance cache, the deposit batcher's batch reads (`useCurrentBatchId`, `useBatchState`, `useTimeUntilDispatchable`), and the asset token's operator-status cache, since the mutation may have granted one.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useRedeem](./useRedeem.md) — the redeem direction
- [useBatchState](./useBatchState.md) / [useClaim](./useClaim.md) — follow and settle the batch you joined
- [Vault.deposit](../sdk/Vault.md#deposit) — imperative equivalent on the `Vault` class
- [Vault deposits and redemptions](../../guides/vault-deposits.md)
