---
title: Vault groups
description: Deposit into one of several vaults without revealing which one.
---

# Vault groups

This guide covers **integrating** the multi-vault router from the SDK. For what it does and why — one transaction joins several vault batchers, with encrypted-zero legs hiding which vault received the money — see the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page and the [router interface](https://docs.zama.org/protocol/confidential-vault/reference/router-interface).

A **vault group** is the SDK's name for the leg list: a set of confidential ERC-4626 vaults that all take deposits in the same confidential asset. Depositing into one member joins _every_ member's batch: the vault you chose gets the amount, the rest get an encrypted zero.

A group has at least two vaults. For a single vault, use [`Vault`](./vault-deposits.md).

{% hint style="danger" %}
Follow the [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients): send the same leg list for every user, and exit through the list you entered with. The SDK never drops a zero-amount leg, and refuses a group above the documented [leg limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits) (`MAX_GROUP_VAULTS`, ten) at construction.
{% endhint %}

## Configuring a group

A group names the shared `cAsset`, its members, and the router that fans a submission out across them. Each member carries its deposit and redeem batchers, and optionally its ERC-4626 `vault`; the share token is read from the redeem batcher. The names follow the [vault addresses](https://docs.zama.org/protocol/confidential-vault/reference/addresses) reference.

```ts
import { createVaultGroup } from "@zama-fhe/sdk/vaults";

const STABLE_GROUP = {
  id: "stable",
  cAsset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [
    { id: "alpha", depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
    { id: "beta", depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
  ],
} as const;

const group = createVaultGroup(sdk, STABLE_GROUP);
```

The SDK ships no group configuration; the addresses belong to your app. They are not trusted blindly: before a submission writes anything, each member is checked against chain (both batchers report the same vault, the deposit batcher pulls `cAsset`), and a mismatch throws `ConfigurationError`.

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
const { redeemBatcher } = group.member("alpha").vault; // the member's batchers
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

Both methods check the caller's confidential balance before submitting, as `Vault` does: a short balance would join every batch with nothing and still cost the transaction. Both take `skipBalanceCheck`; `operatorUntil` only applies to a redemption, since a deposit grants no operator.

### Claiming

Claiming, quitting and batch state are unchanged: they happen per batcher, on the batcher a leg actually joined. Each entry in `joins` gives you that address and the batch id, so `createVaultBatcher(sdk, join.batcher).claim(join.batchId)` is the follow-up. See [Vault deposits and withdrawals](./vault-deposits.md) for the batch lifecycle.

## Replacing a batcher

A batcher is replaced by deploying a new one, not upgraded in place, and the old one keeps accepting joins until its owner pauses it. Nothing on chain points from the old batcher to the new, so the cutover is a configuration change: point the member at the new pair and ship the new config to every client at once, so all users keep sending the same leg list. Positions already on the old batcher are unaffected: each entry in `joins` records the batcher it landed on, and claiming and quitting happen there.

## Grants and registry listing

For a **redemption**, the router pulls each leg's share token, so it needs an ERC-7984 operator grant on every one of them. The SDK makes any missing grant before submitting — note that this is a grant to the _router_, not to the batchers, the opposite of what a single-vault `Vault.redeem` does. Each grant is its own wallet prompt, so the first redemption from a group of N vaults can ask the user to sign up to N + 1 times; later ones reuse the grants while they are valid.

A **deposit** through the router needs no grant: it is a transfer you send. It does require the shared asset to be listed in the registry the router checks, so the SDK asks first and raises `UnlistedConfidentialTokenError` rather than letting you pay for a reverted transaction. Listings are governed on chain and can be revoked, so this is checked per submission rather than remembered.

## Paused batchers

Every submission sends a leg to every member, and a paused batcher rejects joins. Rather than let one paused member revert the whole transaction, the SDK reads `paused()` on each configured batcher first and throws `VaultBatcherPausedError` naming the member. Quitting and claiming on a paused batcher still work, so existing positions are not stuck.
