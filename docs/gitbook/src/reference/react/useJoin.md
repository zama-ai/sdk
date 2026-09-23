---
title: useJoin
description: Low-level mutation hook that joins a single vault batcher's open batch directly.
---

# useJoin

Mutation hook that joins the currently open batch on one batcher contract — the same call as [`VaultBatcher.join`](../sdk/VaultBatcher.md#join). It checks the caller's balance on the batcher's input token, encrypts the amount, and submits the join.

This is the low-level escape hatch. It does **not** grant the batcher an operator approval, so the caller must already have set one on the input token (see [`useConfidentialSetOperator`](./useConfidentialSetOperator.md)) or the batcher cannot pull the amount. Most apps should use [`useDeposit`](./useDeposit.md) / [`useRedeem`](./useRedeem.md), which handle the grant.

## Import

```ts
import { useJoin } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="JoinButton.tsx" %}

```tsx
import { useJoin } from "@zama-fhe/react-sdk/vaults";

function JoinButton() {
  const { mutateAsync: join, isPending } = useJoin({ address: "0xDepositBatcher" });

  async function handleJoin() {
    const { batchId } = await join({ amount: 1_000_000n });
    console.log("Joined batch", batchId);
  }

  return (
    <button onClick={handleJoin} disabled={isPending}>
      {isPending ? "Joining..." : "Join batch"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseJoinConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type JoinParams } from "@zama-fhe/sdk/vaults";
```

### amount

`bigint`

Amount to contribute, in the batcher's input token's base units.

### beneficiary

`Address | undefined`

Default: the connected wallet. Recipient of the batch's eventual output, and owner of the position.

### skipBalanceCheck

`boolean | undefined`

Default: `false`. Skips the confidential-balance pre-flight.

```ts
await join({ amount: 1_000_000n, beneficiary: "0xRecipient" });
```

**Throws:**

- `InsufficientConfidentialBalanceError` — the input-token balance is less than `amount`
- `BalanceCheckUnavailableError` — the balance check needs a decryption the signer can't perform
- `TransactionRevertedError` — the receipt carries no `Joined` event for the beneficiary

## Return Type

`data` resolves to a `JoinResult`: `{ txHash, receipt, batchId, beneficiary, confidentialJoinedAmount }`. See [`Vault` → JoinResult](../sdk/Vault.md#joinresult).

On success the hook invalidates the input token's balance cache and the batcher's batch reads.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md) / [useRedeem](./useRedeem.md) — the recommended hooks, with the operator grant included
- [VaultBatcher.join](../sdk/VaultBatcher.md#join) — imperative equivalent
