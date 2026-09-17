---
title: Vault groups
description: Deposit into one of several vaults without revealing which one.
---

# Vault groups

A **vault group** is a set of confidential ERC-4626 vaults that all take deposits in the same confidential asset. Depositing into one member of a group joins _every_ member's batch: the vault you chose gets the amount, and the rest get an encrypted zero.

That is the whole point. Because the amounts are FHE-encrypted, an observer sees the same number of indistinguishable joins whichever vault you picked, so the choice itself stays private. A single-vault deposit, by contrast, publishes which vault the depositor wanted.

If you only have one vault, use [`Vault`](./vault-deposits.md) — a one-member group is the same thing with extra machinery.

## What it costs

The decoy legs are not free. Each one is real FHE compute, and a transaction has a ceiling on how much of that it may use, so a group is capped at **eight** vaults; the SDK refuses a larger one at construction rather than letting you send transactions that run out of gas.

{% hint style="danger" %}
Do not "optimize" the zero-amount legs away. Skipping them makes a submission cheaper and simultaneously publishes the depositor's choice, which is the one thing the design exists to hide.
{% endhint %}

## Configuring a group

A group names the shared asset, its members, and the router that fans a submission out across them. Each member carries its ERC-4626 vault, its confidential share token, and a **batcher history** per direction (see [Batcher histories](#batcher-histories)).

```ts
import { createVaultGroup } from "@zama-fhe/sdk/vaults";

const STABLE_GROUP = {
  id: "stable",
  asset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [
    {
      id: "alpha",
      vault: "0xAlphaVault",
      share: "0xAlphaShares",
      batchers: {
        deposit: { retired: [], latest: "0xAlphaDepositBatcher" },
        redeem: { retired: [], latest: "0xAlphaRedeemBatcher" },
      },
    },
    {
      id: "beta",
      vault: "0xBetaVault",
      share: "0xBetaShares",
      batchers: {
        deposit: { retired: [], latest: "0xBetaDepositBatcher" },
        redeem: { retired: [], latest: "0xBetaRedeemBatcher" },
      },
    },
  ],
} as const;

const group = createVaultGroup(sdk, STABLE_GROUP);
```

The SDK ships no group configuration; the addresses belong to your app.

{% hint style="info" %}
The member order is the leg order, and the leg count is visible on chain. Adding or removing a member changes the shape of every later submission, so treat group membership as something depositors can observe changing.
{% endhint %}

## Depositing and withdrawing

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { joins } = await group.deposit("alpha", 1_000_000n);

// One entry per member, in group order. The decoys are in here too — they
// joined a real batch with an encrypted zero.
const mine = joins.find((join) => join.vaultId === "alpha");
await group.member("alpha"); // the member's vault and share addresses
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useGroupDeposit } from "@zama-fhe/react-sdk/vaults";

const deposit = useGroupDeposit({ group: STABLE_GROUP });
deposit.mutate({ vaultId: "alpha", amount: 1_000_000n });
```

{% endtab %}
{% endtabs %}

Withdrawing is the mirror image — `group.requestWithdrawal("alpha", shares)` or `useGroupRequestWithdrawal` — with one difference that matters: a deposit's legs all spend the group's shared asset, while a withdrawal's legs each spend their own vault's share token.

A group deposit always credits the caller. Neither the router nor the batchers accept a third-party beneficiary on this path, so unlike `Vault.deposit` there is no `beneficiary` option.

### Claiming

Claiming, quitting and batch state are unchanged: they happen per batcher, on the batcher a leg actually joined. Each entry in `joins` gives you that address and the batch id, so `createVaultBatcher(sdk, join.batcher).claim(join.batchId)` is the follow-up. See [Vault deposits and withdrawals](./vault-deposits.md) for the batch lifecycle.

## Batcher histories

A vault's batcher is replaced rather than upgraded, and a replaced batcher keeps accepting joins until its last configured batch is dispatched. So a member names a _history_ rather than an address:

```ts
batchers: {
  deposit: {
    retired: [{ address: "0xOldDepositBatcher", lastBatchId: 47n }],
    latest: "0xNewDepositBatcher",
  },
  redeem: { retired: [], latest: "0xRedeemBatcher" },
}
```

The SDK reads `currentBatchId` off each retired batcher before every submission and joins the first one that has not passed its `lastBatchId`, falling back to `latest`. The handover happens when someone dispatches that last batch, not at a scheduled time, so it cannot be resolved once and cached. Retired batchers keep their batches claimable and quittable forever, which is why an entry is never removed.

`useActiveBatchers` exposes the same answer for display; give it a `refetchInterval` on a screen that stays open.

## Batching the transfers yourself

By default a group of more than one vault goes through the router: one transaction, one signature. Pass `strategy: "direct"` to get one transfer per leg instead, which is what you want if your wallet can submit them atomically (EIP-5792, smart accounts).

```ts
await group.deposit("alpha", 1_000_000n, { strategy: "direct" });
```

This changes only how the legs are packaged. The legs themselves — how many, in what order, carrying what — are identical either way, deliberately: a leg set that varied with what the caller's wallet could do would leak the caller's wallet class.

## Grants and registry listing

On the router path for a **withdrawal**, the router pulls each leg's share token, so it needs an ERC-7984 operator grant on every one of them. The SDK makes any missing grant before submitting — note that this is a grant to the _router_, not to the batchers, the opposite of what a single-vault `Vault.requestWithdrawal` does.

A router **deposit** needs no grant: it is a transfer you send. It does require the shared asset to be listed in the registry the router checks, so the SDK asks first and raises `UnlistedConfidentialTokenError` rather than letting you pay for a reverted transaction. Listings are governed on chain and can be revoked, so this is checked per submission rather than remembered.
