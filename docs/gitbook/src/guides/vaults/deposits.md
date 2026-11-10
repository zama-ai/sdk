---
title: Vault deposits and redemptions
description: How to deposit into and redeem from confidential ERC-4626 vaults with the Zama SDK vault client.
---

# Vault deposits and redemptions

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This guide walks through the full life of a vault position: define your vaults, deposit, store the join record, follow the position, and exit. For how batching and settlement work on-chain, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault), in particular its [deposit guide](https://docs.zama.org/protocol/confidential-vault/guides/deposit).

The examples use the SDK's signer. To send through your own transaction pipeline instead, see [Send through your own pipeline](groups.md#send-through-your-own-pipeline).

## Steps

### 1. Define your vaults

`defineVaults` describes every vault your app uses, grouped by the confidential asset they take. Define it once, at module level:

```ts
// vaults.ts
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
    solo: {
      asset: "0xConfidentialUSDC2",
      vaults: { main: { depositBatcher: "0xMainDeposit", redeemBatcher: "0xMainRedeem" } },
    },
  },
});
```

Each vault has two batchers: one that deposits take, and one that redemptions take. When a batcher is upgraded, its entry becomes a history of batchers. See [Upgrade a batcher](groups.md#upgrade-a-batcher). The group and vault ids are yours to choose, and the types keep them, so a typo in `groupId` or `vaultId` is a type error.

`defineVaults` checks the shape of the config and throws `ConfigurationError` for an invalid address, an empty group, a group above `MAX_GROUP_VAULTS`, or a batcher named twice. On the first join of each group, the client also checks the config against the chain. See [`defineVaults`](../../reference/sdk/VaultClient.md#definevaults).

{% hint style="warning" %}
The key order of `vaults` is the leg order of every join. Never reorder, add or remove vaults in a group once users have joined it: their stored records would no longer match the group, and the client rejects a record that does not have one leg per vault in config order. To change a group, add a new group.
{% endhint %}

### 2. Create the client

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

const client = createVaultClient(sdk, VAULTS);
```

{% endtab %}
{% tab title="React SDK" %}

The hooks take the config and create the client for you. Use `useVaultClient` when you need the client itself:

```tsx
import { useVaultClient } from "@zama-fhe/react-sdk/vaults";
import { VAULTS } from "./vaults";

const client = useVaultClient(VAULTS);
```

{% endtab %}
{% endtabs %}

One client serves every group of the config.

### 3. Deposit

A deposit checks the balance, encrypts the amount, and joins the open batch of every vault of the group:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { record, txHashes } = await client.deposit({
  groupId: "stable",
  vaultId: "beta",
  amount: 1_000_000n,
});
await saveRecord(record);
```

{% endtab %}
{% tab title="React SDK" %}

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
{% endtabs %}

The amount is in the asset's base units, so `1_000_000n` is one unit of a 6-decimal token. In a group of one, `vaultId` is optional:

```ts
await client.deposit({ groupId: "solo", amount: 1_000_000n });
```

The SDK checks your confidential balance before it sends, as `Token.confidentialTransfer` does. A confidential transfer above the balance moves zero instead of reverting, so without this check a too-large deposit would succeed on-chain and deposit nothing. For an account whose balance the signer cannot decrypt, pass `skipChecks: ["balance"]` in the options.

#### Deposit for another account

In a group of one, `beneficiary` credits another account:

```ts
await client.deposit({ groupId: "solo", amount: 1_000_000n, beneficiary: "0xRecipient" });
```

The batcher then pulls the amount, so the SDK first grants it an operator approval if none is active: up to two wallet prompts. The beneficiary owns the position. Only they can cancel it, and the payout goes to them. A group of several vaults joins through the router, which always credits the sender, so `beneficiary` is a type error there.

### 4. Store the join record

`deposit` returns a `JoinRecord`: the group, the direction, the credited account, and the batch id of every leg, decoys included. It never names the chosen vault or the amount. **You need the record to read and exit the position**, so store it where the user finds it again after a reload or on another device.

The record holds `bigint` batch ids, which `JSON.stringify` cannot serialize. Convert them to strings and back:

```ts
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

type StoredRecord = VaultRecord<typeof VAULTS>;

function toJson(record: StoredRecord): string {
  return JSON.stringify(record, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

function fromJson(json: string): StoredRecord {
  return JSON.parse(json, (key, value: unknown) =>
    key === "batchId" && typeof value === "string" ? BigInt(value) : value,
  ) as StoredRecord;
}
```

If the join is mined but the SDK cannot match a `Joined` event in the receipt to every leg, `deposit` throws `VaultJoinUnconfirmedError` instead of returning a record. The deposit most likely went through. Look the transaction up before you deposit again. See [`VaultJoinUnconfirmedError`](../../reference/sdk/errors.md#vaultjoinunconfirmederror).

### 5. Follow the position

`readPosition` reads every leg's batch and returns the position's `phase` and the actions you can send now:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const position = await client.readPosition(record);

console.log(position.phase); // "queued" | "settling" | "ready" | "closed"
console.log(position.availableActions); // for example ["exit"]
console.log(position.nextChangeAt); // chain time at which the actions can change, or null
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { usePosition } from "@zama-fhe/react-sdk/vaults";

const { data: position } = usePosition(VAULTS, record);
```

`usePosition` refetches when `nextChangeAt` passes, and polls while a batch settles, so you need no timer of your own.

{% endtab %}
{% endtabs %}

| `phase`    | What it means                                                            | What you can send                     |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `queued`   | Every batch waits for dispatch.                                          | `exit` cancels for a refund           |
| `settling` | A batch was dispatched and waits for settlement.                         | `finalize`, normally done by a keeper |
| `ready`    | No batch is in flight, and some batch has settled or was canceled.       | `exit` pays out or refunds            |
| `closed`   | The position was exited. Only a read with `decrypt: true` can report it. | nothing                               |

A keeper (an off-chain service that watches batches) normally sends `dispatch` and `finalize` for every batch, so the user only waits. Both are permissionless and cover every eligible leg. `availableActions` lists them when they apply, so your app can offer them as a fallback. See [Building a vault UI](building-a-ui.md) for what to show in each phase.

{% hint style="warning" %}
Without `decrypt: true`, an exited position still reads `ready` or `queued`, with `exit` available. An exit replaces each deposit with an encrypted zero, and only a decryption can see that. Exits are idempotent, so sending one again moves nothing. To show a position as done, read it with `decrypt: true`, or record the exit in your own storage.
{% endhint %}

### 6. Exit

`exit` covers every leg of the join. For each leg, it quits a pending batch (refund), claims a finalized batch (payout), or recovers a canceled batch (refund):

{% tabs %}
{% tab title="Core SDK" %}

```ts
await client.exit(record);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useExit } from "@zama-fhe/react-sdk/vaults";

const exit = useExit(VAULTS);
exit.mutate(record);
```

{% endtab %}
{% endtabs %}

`exit` sends one transaction per leg, so a group of N vaults takes N wallet prompts. It throws `VaultActionNotAllowedError` while a batch is dispatched: wait for it to settle first.

The claimed shares land in the vault's share token, an ordinary confidential token. Read it with [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md) or `Token.balanceOf`. The vault hooks invalidate every confidential balance after an action.

## Redemptions

A redemption is the mirror image: it joins the redeem batchers, and the amount is in shares, not assets (ERC-4626 `redeem`, not `withdraw`). Exiting a settled redemption pays out the asset.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { record } = await client.redeem({ groupId: "stable", vaultId: "beta", amount: 500n });
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";

const redeem = useRedeem(VAULTS, { onSuccess: ({ record }) => saveRecord(record) });
redeem.mutate({ groupId: "stable", vaultId: "beta", amount: 500n });
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
**A redemption from a group of N vaults can take up to N + 1 wallet prompts.** The router pulls each vault's share token, so the account first grants the router an operator approval on every share token it has not granted yet, then sends the join. Tell users before they start. See [Wallet prompts](groups.md#wallet-prompts).
{% endhint %}

## Show when the next batch closes

`readOpenBatches` reads the open batch of every vault of a group. Use it on a deposit form to show when the next batch can be dispatched, or that a vault is paused:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const batches = await client.readOpenBatches("stable", "deposit");
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";

const { data: batches } = useOpenBatches(VAULTS, { groupId: "stable", direction: "deposit" });
```

{% endtab %}
{% endtabs %}

A paused batcher in a group blocks every join of the group, because every join sends a leg to every vault. `deposit` and `redeem` throw `VaultBatcherPausedError`, naming the paused vault, before anything is sent. Exits still work on a paused batcher.

## Reads on another chain

Reads go to the config's `chainId`, whatever chain the wallet is on, so a vault page can render before the wallet connects. This needs a provider that can read another chain, such as `WagmiProvider`. Joins, `finalize`, and reads with `decrypt` encrypt or decrypt on the provider's chain, so they throw `ConfigurationError` until the provider is on the config's chain. The send methods throw `ChainMismatchError` while the wallet is on another chain.

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each position phase
- [Vault groups](groups.md): groups of several vaults, wallet prompts, atomic wallets, and your own pipeline
- [`VaultClient`](../../reference/sdk/VaultClient.md): the full API reference
- [`useDeposit`](../../reference/react/useDeposit.md), [`usePosition`](../../reference/react/usePosition.md), [`useExit`](../../reference/react/useExit.md): the React hooks used above
- [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault): how batching, dispatch and settlement work on-chain
- [Check balances](../check-balances.md): reading the asset and share balances
