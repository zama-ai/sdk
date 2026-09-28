---
title: Vault groups
description: Deposit into one of several vaults without revealing which one.
---

# Vault groups

This guide covers **integrating** the multi-vault router from the SDK. For what it does and why — one transaction joins several vault batchers, with encrypted-zero legs hiding which vault received the money — see the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page and the [router interface](https://docs.zama.org/protocol/confidential-vault/reference/router-interface).

A **vault group** is the SDK's name for the leg list: a set of confidential ERC-4626 vaults that all take deposits in the same confidential asset. Depositing into one member joins _every_ member's batch: the vault you chose gets the amount, the rest get an encrypted zero.

If you only have one vault, use [`Vault`](./vault-deposits.md) — a one-member group is the same thing with extra machinery.

{% hint style="danger" %}
Follow the [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients): send the same leg list for every user, and exit through the list you entered with. The SDK never drops a zero-amount leg, and refuses a group above the documented [leg limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits) (`MAX_GROUP_VAULTS`, ten) at construction.
{% endhint %}

## Configuring a group

A group names the shared `cAsset`, its members, and the router that fans a submission out across them. Each member carries its ERC-4626 `vault`, its `cShare`, and a **batcher history** per direction (see [Batcher histories](#batcher-histories)). The names follow the [vault addresses](https://docs.zama.org/protocol/confidential-vault/reference/addresses) reference.

```ts
import { createVaultGroup } from "@zama-fhe/sdk/vaults";

const STABLE_GROUP = {
  id: "stable",
  cAsset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [
    {
      id: "alpha",
      vault: "0xAlphaVault",
      cShare: "0xAlphaShares",
      batchers: {
        deposit: { retired: [], latest: "0xAlphaDepositBatcher" },
        redeem: { retired: [], latest: "0xAlphaRedeemBatcher" },
      },
    },
    {
      id: "beta",
      vault: "0xBetaVault",
      cShare: "0xBetaShares",
      batchers: {
        deposit: { retired: [], latest: "0xBetaDepositBatcher" },
        redeem: { retired: [], latest: "0xBetaRedeemBatcher" },
      },
    },
  ],
} as const;

const group = createVaultGroup(sdk, STABLE_GROUP);
```

The SDK ships no group configuration; the addresses belong to your app. They are not trusted blindly: before a submission writes anything, each leg's token and vault are checked against what its batcher reports, and a mismatch throws `ConfigurationError`.

{% hint style="info" %}
The member order is the leg order, and the leg count is visible on chain. Adding or removing a member changes the shape of every later submission, so treat group membership as something depositors can observe changing.
{% endhint %}

## Depositing and redeeming

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { joins } = await group.deposit("alpha", 1_000_000n);

// One entry per member, in group order. The decoys are in here too — they
// joined a real batch with an encrypted zero.
const mine = joins.find((join) => join.vaultId === "alpha");
const { vault, cShare } = group.member("alpha"); // the member's addresses
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

Redeeming is the mirror image — `group.redeem("alpha", shares)` or `useGroupRedeem` — with one difference that matters: a deposit's legs all spend the group's shared asset, while a redemption's legs each spend their own vault's share token. As with `Vault.redeem`, the amount is denominated in shares.

A group deposit always credits the caller. The router credits the account the legs came from, so unlike `Vault.deposit` there is no `beneficiary` option.

Both methods check the caller's confidential balance before submitting, as `Vault` does: a short balance would join every batch with nothing and still cost the transaction. They take the same `skipBalanceCheck` and `operatorUntil` options.

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

## Batching the joins yourself

By default a group of more than one vault goes through the router: one transaction, one signature. Pass `strategy: "direct"` to get one batcher `join` per leg instead, submitted as separate transactions in group order. Each leg then takes the two steps `Vault.deposit` takes: an operator grant to that batcher on the leg's token, and a join with an amount encrypted against it.

The direct path is not atomic. If a later leg is rejected or reverts, the earlier joins stay committed on their batchers and the call throws; quit them there (`createVaultBatcher(sdk, batcher).quit(batchId)`, with the batch id read from that batcher's `currentBatchId`) or leave them as real positions of zero or the chosen amount.

```ts
await group.deposit("alpha", 1_000_000n, { strategy: "direct" });
```

This changes only how the legs are packaged. The legs themselves — how many, in what order, carrying what — are identical either way, deliberately: a leg set that varied with what the caller's wallet could do would leak the caller's wallet class.

## Grants and registry listing

On the router path for a **redemption**, the router pulls each leg's share token, so it needs an ERC-7984 operator grant on every one of them. The SDK makes any missing grant before submitting — note that this is a grant to the _router_, not to the batchers, the opposite of what a single-vault `Vault.redeem` does. On the direct path the grants go to the batchers, one per leg, as with `Vault`.

A router **deposit** needs no grant: it is a transfer you send. It does require the shared asset to be listed in the registry the router checks, so the SDK asks first and raises `UnlistedConfidentialTokenError` rather than letting you pay for a reverted transaction. Listings are governed on chain and can be revoked, so this is checked per submission rather than remembered.
