---
title: Vault deposits and redemptions
description: How to deposit into and redeem from confidential ERC-4626 vaults with the Zama SDK vault client.
---

# Vault deposits and redemptions

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This guide walks through the full life of a vault deposit: define a group, deposit, store the batches, follow them, and get the money out. For how batching and settlement work on-chain, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault), in particular its [deposit guide](https://docs.zama.org/protocol/confidential-vault/guides/deposit).

The examples use the SDK's signer. To send through your own transaction pipeline instead, see [Send through your own pipeline](groups.md#send-through-your-own-pipeline).

## Steps

### 1. Define a group

`defineVaultGroup` describes one group of vaults that take deposits in the same confidential asset. Define each group once, at module level:

```ts
// vaults.ts
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

export const SOLO = defineVaultGroup({
  id: "solo",
  chainId: 1,
  asset: "0xConfidentialUSDC2",
  vaults: [
    {
      id: "main",
      batchers: { deposit: "0xMainDeposit", redeem: "0xMainRedeem" },
      share: "0xMainShare",
    },
  ],
});
```

Each vault has two batchers: one that deposits join, and one that redemptions join. `share` is the vault's confidential share token. When a batcher is upgraded, its entry becomes a history of batchers. See [Upgrade a batcher](groups.md#upgrade-a-batcher). The group and vault ids are yours to choose, and the types keep them, so a typo in `vaultId` passed to a client method is a type error. The React mutation hooks take `vaultId` as a plain `string`.

`defineVaultGroup` checks the shape of the group and throws `ConfigurationError` for an invalid address, an empty group, a group above `MAX_GROUP_VAULTS`, a repeated vault id, or a batcher named twice. On the first join of each group, the client also checks the group against the chain. See [`defineVaultGroup`](../../reference/sdk/VaultClient.md#definevaultgroup).

{% hint style="warning" %}
The order of `vaults` is the leg order of every join. Never reorder, add or remove vaults in a group once users have joined it: every user of a group should join the same vaults in the same order, so their transactions look alike. To change a group, define a new group.
{% endhint %}

### 2. Create the client

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";

const vaults = createVaultClient(sdk);
```

{% endtab %}
{% tab title="React SDK" %}

The hooks create the client for you. Use `useVaultClient` when you need the client itself:

```tsx
import { useVaultClient } from "@zama-fhe/react-sdk/vaults";

const vaults = useVaultClient();
```

{% endtab %}
{% endtabs %}

The client holds no config. Every method takes the group or the batch it acts on, so one client serves every group and chain.

### 3. Deposit

A deposit checks the balance, encrypts the amount, and joins the open batch of every vault of the group:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { STABLE } from "./vaults";

const { batches, txHashes } = await vaults.deposit(STABLE, { vaultId: "beta", amount: 1_000_000n });
await saveBatches(batches);
```

{% endtab %}
{% tab title="React SDK" %}

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
{% endtabs %}

The amount is in the asset's base units, so `1_000_000n` is one unit of a 6-decimal token.

The SDK checks your confidential balance before it sends, as `Token.confidentialTransfer` does. A confidential transfer above the balance moves zero instead of reverting, so without this check a too-large deposit would succeed on-chain and deposit nothing. For an account whose balance the signer cannot decrypt, pass `skipChecks: ["balance"]` in the options.

#### Deposit for another account

In a group of one, `beneficiary` credits another account:

```ts
import { SOLO } from "./vaults";

await vaults.deposit(SOLO, { vaultId: "main", amount: 1_000_000n, beneficiary: "0xRecipient" });
```

The batcher then pulls the amount, so the SDK first grants it an operator approval if none is active: up to two wallet prompts. The beneficiary owns the deposit. Only they can quit it, and a claim pays them. A group of several vaults joins through the router, which always credits the sender, so `beneficiary` there throws `ConfigurationError`.

### 4. Store the batches

`deposit` returns `batches`: the batch each leg landed in, decoys included, as `{ vaultId, chainId, batcher, batchId }`. **You need them to read, claim or quit the deposit later**, so store them where the user finds them again after a reload or on another device. Keep which vault was chosen in the user's own storage only, if you need it.

`batchId` is a `bigint`, which `JSON.stringify` cannot serialize. Convert it to a string and back:

```ts
import type { BatchRef } from "@zama-fhe/sdk/vaults";

type StoredBatch = BatchRef & { vaultId: string };

function toJson(batches: readonly StoredBatch[]): string {
  return JSON.stringify(batches, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

function fromJson(json: string): StoredBatch[] {
  return JSON.parse(json, (key, value: unknown) =>
    key === "batchId" && typeof value === "string" ? BigInt(value) : value,
  ) as StoredBatch[];
}
```

If the join is mined but the SDK cannot match a `Joined` event in the receipt to every leg, `deposit` throws `VaultJoinUnconfirmedError` instead of returning. The deposit most likely went through. Look the transaction up before you deposit again. See [`VaultJoinUnconfirmedError`](../../reference/sdk/errors.md#vaultjoinunconfirmederror).

### 5. Follow a batch

`readBatch` reads one batch and returns its `state` and the `actions` you can send now. Pass the account to read its deposit and to list `claim` and `quit`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const batch = await vaults.readBatch({ ...batchRef, account: "0xUser" });

console.log(batch.state); // "pending" | "dispatched" | "finalized" | "canceled"
console.log(batch.actions); // for example ["quit", "dispatch"]
console.log(batch.nextChangeAt); // chain time at which the actions can change, or null
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useBatch } from "@zama-fhe/react-sdk/vaults";

const { data: batch } = useBatch(batchRef, { account: "0xUser" });
```

`useBatch` refetches when `nextChangeAt` passes, and polls while the batch waits for a dispatch or a settlement, so you need no timer of your own.

{% endtab %}
{% endtabs %}

| `state`      | What it means                                        | What the user can send      |
| ------------ | ---------------------------------------------------- | --------------------------- |
| `pending`    | The batch is open, and waits for dispatch.           | `quit`, for a refund        |
| `dispatched` | The batch was sent to the vault and waits to settle. | nothing; a keeper finalizes |
| `finalized`  | The batch settled at the vault's exchange rate.      | `claim`, for the payout     |
| `canceled`   | The batch did not go through.                        | `quit`, for a refund        |

A keeper (an off-chain service that watches batches) normally dispatches, finalizes and claims every batch, so the user only waits. `actions` lists `dispatch`, `finalize` and `claim` when they apply, so your app can offer them as a fallback. See [Building a vault UI](building-a-ui.md) for what to show in each state.

### 6. Get the money out

Once the batch is finalized, a claim pays the deposit out at the batch's exchange rate. A keeper normally claims for every depositor. `claim` is the fallback, and anyone may send it: the output always goes to the account.

{% tabs %}
{% tab title="Core SDK" %}

```ts
await vaults.claim({ ...batchRef, account: "0xUser" });
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useClaim } from "@zama-fhe/react-sdk/vaults";

const claim = useClaim();
claim.mutate({ ...batchRef, account: "0xUser" });
```

{% endtab %}
{% endtabs %}

To take a deposit back before the batch is dispatched, quit it. Only the depositor can quit. In a group, quit the batch of every leg, not only the chosen one, or the quits show which vault the user picked:

```ts
for (const batch of batches) {
  await vaults.quit(batch);
}
```

The claimed shares land in the vault's share token, an ordinary confidential token. Read it with [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md) or `Token.balanceOf`. The vault hooks invalidate every confidential balance after an action.

## Redemptions

A redemption is the mirror image: it joins the redeem batchers, and the amount is in shares, not assets (ERC-4626 `redeem`, not `withdraw`). Claiming a finalized redemption pays out the asset.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { batches } = await vaults.redeem(STABLE, { vaultId: "beta", amount: 500n });
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";
import { STABLE } from "./vaults";

const redeem = useRedeem({ onSuccess: ({ batches }) => saveBatches(batches) });
redeem.mutate({ group: STABLE, vaultId: "beta", amount: 500n });
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
**A first redemption from a group of N vaults can take up to N + 1 wallet prompts.** The router pulls each vault's share token, so the account first grants the router an operator approval on every share token it has not granted yet, then sends the join. Tell users before they start. See [Wallet prompts](groups.md#wallet-prompts).
{% endhint %}

## Show when the next batch closes

`readOpenBatches` reads the open batch of every vault of a group. Use it on a deposit form to show when the next batch can be dispatched, or that a vault is paused:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const open = await vaults.readOpenBatches(STABLE, "deposit");
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";

const { data: open } = useOpenBatches(STABLE, "deposit");
```

{% endtab %}
{% endtabs %}

A paused batcher in a group blocks every join of the group, because every join sends a leg to every vault. `deposit` and `redeem` throw `VaultBatcherPausedError`, naming the paused vault, before anything is sent. Claims and quits still work on a paused batcher.

## Reads on another chain

Reads go to the group's or batch's `chainId`, whatever chain the wallet is on, so a vault page can render before the wallet connects. This needs a provider that can read another chain, such as `WagmiProvider`. Joins and `finalize` encrypt or decrypt on the provider's chain, so they throw `ConfigurationError` until the provider is on the group's chain. The send methods throw `ChainMismatchError` while the wallet is on another chain.

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each batch state
- [Vault groups](groups.md): groups of several vaults, privacy rules, wallet prompts, and your own pipeline
- [`VaultClient`](../../reference/sdk/VaultClient.md): the full API reference
- [`useDeposit`](../../reference/react/useDeposit.md), [`useBatch`](../../reference/react/useBatch.md), [`useClaim`](../../reference/react/useClaim.md), [`useQuit`](../../reference/react/useQuit.md): the React hooks used above
- [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault): how batching, dispatch and settlement work on-chain
- [Check balances](../check-balances.md): reading the asset and share balances
