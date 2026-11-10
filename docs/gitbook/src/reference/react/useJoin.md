---
title: useJoin
description: Low-level mutation hook that joins a single vault batcher's open batch directly.
---

# useJoin

Mutation hook that joins the currently open batch on one batcher contract — the same call as [`VaultBatcher.join`](../sdk/VaultBatcher.md#join). It checks the caller's balance on the batcher's input token, encrypts the amount, and submits the join.

This is the low-level escape hatch. A join for the caller sends the amount to the batcher and needs no operator approval. A join for another `beneficiary` makes the batcher pull the amount, and this hook does **not** grant that approval, so the caller must already have set one on the input token (see [`useConfidentialSetOperator`](./useConfidentialSetOperator.md)). Most apps should use [`useDeposit`](./useDeposit.md) / [`useRedeem`](./useRedeem.md), which handle the grant.

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

### chainId

`number | undefined`

Chain the batcher is on. If the wallet is on another chain, the mutation throws [`ChainMismatchError`](../sdk/errors.md#chainmismatcherror) instead of sending.

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

### onJoinSubmitted

`((txHash: Hex) => void) | undefined`

Called with the join's transaction hash once the wallet has sent it, before the SDK waits for the receipt. Use it to move the UI from "confirm in your wallet" to "waiting for the transaction". If the callback throws, the SDK logs a warning and the join continues.

**Throws:**

- `InsufficientConfidentialBalanceError` — the input-token balance is less than `amount`
- `BalanceCheckUnavailableError` — the balance check needs a decryption the signer can't perform
- `TransactionRevertedError` — the receipt carries no `Joined` event for the beneficiary

## Return Type

`data` resolves to a `JoinResult`: `{ txHash, receipt, batchId, beneficiary, confidentialJoinedAmount }`. See [`Vault` → JoinResult](../sdk/Vault.md#joinresult).

On success the hook invalidates the input token's balance cache and the batcher's batch reads.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useDeposit](./useDeposit.md) / [useRedeem](./useRedeem.md) — the recommended hooks, which grant the operator approval a join for another `beneficiary` needs
- [VaultBatcher.join](../sdk/VaultBatcher.md#join) — imperative equivalent
