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

The SDK ships no group configuration; the addresses belong to your app. Each member is checked against chain before a submission writes anything, and a mismatch throws `ConfigurationError`.

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

Both methods check the caller's confidential balance before submitting, as `Vault` does; a redemption decrypts every member's share balance, so the relayer cannot tell which was chosen. Both take `skipBalanceCheck`; `redeem` also takes `operatorUntil`.

### Claiming

Claiming, quitting and batch state are unchanged: they happen per batcher, on the batcher a leg actually joined. Each entry in `joins` gives you that address and the batch id, so `createVaultBatcher(sdk, join.batcher).claim(join.batchId)` is the follow-up. See [Vault deposits and withdrawals](./vault-deposits.md) for the batch lifecycle.

## Grants and registry listing

For a **redemption**, the router pulls each leg's share token, so the SDK grants it an operator approval on every share token that lacks one, one wallet prompt each — a grant to the _router_, not to the batchers as with `Vault.redeem`. A **deposit** needs no grant, but the asset must be listed in the router's registry; the SDK checks and throws `UnlistedConfidentialTokenError` rather than paying for a revert.

## Paused batchers

Every submission sends a leg to every member, so the SDK reads `paused()` on each batcher first and throws `VaultBatcherPausedError` naming the member, instead of letting one paused member revert the transaction.
