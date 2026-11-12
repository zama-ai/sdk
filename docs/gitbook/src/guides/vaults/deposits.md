---
title: Vault deposits and redemptions
description: Define a vault group, deposit or redeem with the Zama SDK vault client, and follow each batch to the payout.
---

# Vault deposits and redemptions

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This guide takes a deposit from the form to the payout: define a group, deposit, store the batches, follow them, and get the money out. It assumes the ideas in the [Vaults overview](README.md): batches, keepers and groups.

The examples send with the SDK's signer. To send through your own pipeline, see [Send through your own pipeline](advanced.md#send-through-your-own-pipeline).

## Steps

### 1. Define a group

Describe each vault once with `defineVault`, and group the vaults that take the same asset with `defineVaultGroup`. Do it at module level:

```ts
// vaults.ts
import { defineVault, defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
});

export const BETA = defineVault({
  id: "beta",
  chainId: 1,
  batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
});

export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
```

A vault names its two batchers: the one deposits join, and the one redemptions join. It names no token: the client reads the asset and the share token from the batchers. The ids are yours to choose. The types keep them, so a typo in `vaultId` is a type error.

Every method that takes a group also takes a vault on its own, such as `ALPHA`, with no `vaultId`. That join shows which vault was chosen.

{% hint style="warning" %}
The order of `vaults` is the leg order of every join. Never change a group once users have joined it: define a new one. See [A group hides which vault you chose](README.md#a-group-hides-which-vault-you-chose).
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

The hooks create the client for you. Call `useVaultClient()` only when you need the client itself.

{% endtab %}
{% endtabs %}

The client holds no config, so one client serves every group and chain.

### 3. Deposit

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { STABLE } from "./vaults";

const { batches } = await vaults.deposit(STABLE, { vaultId: "beta", amount: 1_000_000n });
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

The amount is in the asset's base units, so `1_000_000n` is one unit of a 6-decimal token. To join a vault on its own, pass it with no `vaultId`: `vaults.deposit(ALPHA, { amount })`, or `deposit.mutate({ vault: ALPHA, amount })`.

Before sending, the SDK checks the confidential balance. A confidential transfer above the balance moves zero instead of reverting, so a too-large deposit would otherwise succeed and deposit nothing. Pass `skipBalanceCheck: true` to send without it.

### 4. Store the batches

`batches` holds the batch every leg landed in, decoys included, as `{ vaultId, chainId, batcher, batchId }`. **Without them, your app cannot read, claim or quit the deposit.** Store them where the user finds them again after a reload or on another device. If you record which vault the user chose, keep it in the user's own storage only.

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

If the deposit throws [`VaultJoinUnconfirmedError`](../../reference/sdk/errors.md#vaultjoinunconfirmederror), the join was mined but the SDK could not read every batch from its receipt. The deposit most likely went through, so look the transaction up before depositing again.

### 5. Follow a batch

`readBatch` returns the batch's `state` and the `actions` you can send now. Pass the account to read its deposit and to list `claim` and `quit`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const batch = await vaults.readBatch(batchRef, "0xUser");

batch.state; // "pending" | "dispatched" | "finalized" | "canceled"
batch.actions; // for example ["quit", "dispatch"]
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useBatch } from "@zama-fhe/react-sdk/vaults";

const { data: batch } = useBatch(batchRef, { account: "0xUser" });
```

`useBatch` refetches on its own as the batch moves, so you need no timer.

{% endtab %}
{% endtabs %}

For what to show and offer in each state, see [Building a vault UI](building-a-ui.md).

### 6. Get the money out

Once the batch is finalized, a keeper claims for every depositor. To claim yourself, for example when the keeper is late:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await vaults.claim(batchRef, "0xUser");
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

The shares land in the vault's share token, an ordinary confidential token. Read them with [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md) or `Token.balanceOf`.

To take a deposit back while the batch is pending, quit the batch of every leg of the join:

```ts
for (const batch of batches) {
  await vaults.quit(batch);
}
```

## Redeem

A redemption is the mirror image. Its amount is in shares, not assets (ERC-4626 `redeem`, not `withdraw`), and its claim pays out the asset.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { batches } = await vaults.redeem(STABLE, { vaultId: "beta", amount: 500n });
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";

const redeem = useRedeem({ onSuccess: ({ batches }) => saveBatches(batches) });
redeem.mutate({ group: STABLE, vaultId: "beta", amount: 500n });
```

{% endtab %}
{% endtabs %}

The first redemption from a group of N vaults can take up to N + 1 wallet prompts. See [Wallet prompts](advanced.md#wallet-prompts).

## Show the open batches

`readOpenBatches` reads the batch the next join lands in, for every vault of a group. Use it on a form to show when that batch can be dispatched, or that a vault is paused, which blocks every join of its group:

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

## Read before the wallet is on the right chain

Reads go to the group's or batch's chain, whatever chain the wallet is on, so a vault page can render before the wallet connects or switches. This needs a provider that can read another chain, such as `WagmiProvider`.

Writes need the vault's chain. While the wallet is on another chain, they throw `ChainMismatchError`: prompt a network switch.

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each batch state
- [Advanced vault integration](advanced.md): wallet prompts, batcher upgrades and your own pipeline
- [`VaultClient`](../../reference/sdk/VaultClient.md): the API reference
