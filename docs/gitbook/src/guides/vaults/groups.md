---
title: Vault groups
description: Deposit into one of several vaults without revealing which one, and send vault calls through your own pipeline.
---

# Vault groups

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

A **vault group** is a set of confidential ERC-4626 vaults that take deposits in the same confidential asset. Every join sends a leg to every vault of the group: the vault you chose gets the amount, and the others get an encrypted zero. An observer cannot tell which vault received the money.

For how the on-chain router fans one transaction out across several batchers, see the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page and the [router interface](https://docs.zama.org/protocol/confidential-vault/reference/router-interface).

## Configure a group

A group names its asset and its vaults in your `defineVaults` config:

```ts
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
  },
});
```

A group holds from one vault up to `MAX_GROUP_VAULTS`, the router's per-transaction leg limit. A group of one has nothing to hide a leg among, so it joins its batcher directly, without the router.

A multi-vault join goes through the chain's router, `vaultRouterAddress` in the chain preset. Set `router` in the config only for a chain whose preset names none. When the preset names a router, a different `router` throws `ConfigurationError`.

## Privacy rules the client enforces

The client keeps a group's choice of vault private by never acting on part of a join:

- **Every join covers every vault.** `deposit` and `redeem` send a leg to each vault, in config order, and never drop a zero leg.
- **Every exit covers every leg.** `exit` quits, claims or recovers each leg, decoys included. A claim or quit is public, so exiting only the chosen leg would show which vault it was.
- **Every decryption covers every leg.** The balance check decrypts every token the legs spend, and `readPosition` with `decrypt: true` decrypts every leg's deposit together. A lone decryption would tell the relayer which vault you care about.
- **Every user gets the same leg list.** All users of a group join the same vaults in the same order, so their transactions look alike. Do not reorder or change a group's vaults once users have joined it.

These follow the [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients) of the router.

## Wallet prompts

The SDK's send methods send one transaction per call, so each call is one wallet prompt. The number depends on the action and the group's size:

| Action                       | Group of one | Group of N vaults |
| ---------------------------- | ------------ | ----------------- |
| `deposit`                    | 1            | 1                 |
| `deposit` with `beneficiary` | up to 2      | not allowed       |
| `redeem`                     | 1            | **up to N + 1**   |
| `exit`                       | 1            | N                 |
| `dispatch`, `finalize`       | 1            | up to N           |

A multi-vault deposit is one transfer of the asset to the router, which splits it into legs. It needs no grant, but the router's registry must list the asset. The SDK checks this and throws `UnlistedConfidentialTokenError` instead of paying for a revert.

A multi-vault redemption is different. Each vault has its own share token, and the router pulls every one of them. So the account first grants the router an ERC-7984 operator approval on every share token it has not granted yet: one prompt each, then one prompt for the join.

{% hint style="warning" %}
**Make the N + 1 prompts visible to users.** The first redemption from a group of N vaults asks for up to N grants, then the join. Later redemptions ask for no grant while the grants last. A grant lasts `grantValiditySeconds` (one hour by default), so a redemption after the grants expire asks for all of them again. Say so on the redeem form before the user starts, pass a longer `grantValiditySeconds` if that suits your app, or use an [atomic wallet](#atomic-wallets).
{% endhint %}

```ts
await client.redeem(
  { groupId: "stable", vaultId: "beta", amount: 500n },
  { grantValiditySeconds: 86_400 },
);
```

## Paused batchers

Every join sends a leg to every vault, and one paused batcher reverts the whole join. So `deposit` and `redeem` read `paused()` on each batcher first and throw `VaultBatcherPausedError`, naming the paused vault. This check cannot be skipped. Exits still work on a paused batcher, so existing positions are never stuck.

## Upgrade a batcher

A vault's batcher can be replaced by a new one, for example to pick up a contract fix. Users with batches on the old batcher must still be able to read and exit them, so your config keeps the old batcher as a retired entry. Replace the plain address with a `BatcherHistory`:

```ts
import { defineVaults } from "@zama-fhe/sdk/vaults";

export const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0xConfidentialUSDC",
      vaults: {
        alpha: {
          depositBatcher: {
            retired: [{ address: "0xAlphaDepositV1", lastBatchId: 41n }],
            latest: "0xAlphaDepositV2",
          },
          redeemBatcher: "0xAlphaRedeem",
        },
        beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
      },
    },
  },
});
```

How the client uses it:

- **Joins switch on the batch, not the clock.** A join goes to the first retired batcher whose open batch is still at most its `lastBatchId`, and otherwise to `latest`. Joins keep landing on the old batcher until batch `lastBatchId` is dispatched, then go to the new one. You can ship the new config before the switch.
- **Records keep the batcher each leg joined.** A position on a retired batcher reads and exits as before. `readPosition` and `exit` accept a record whose legs name any batcher in the vault's history.
- **`readOpenBatches` reports the active batcher**, so a form shows the batch the next join lands in.
- **Every batcher of a vault must serve the same vault.** On the first join, the client checks that each batcher, retired ones included, trades the group's asset for the same share token against the same ERC-4626 vault. A mismatch throws `ConfigurationError`.

To upgrade again, append the current `latest` to the end of `retired` with its `lastBatchId`, and set the new `latest`. Keep `retired` oldest first.

{% hint style="warning" %}
Never remove a retired entry, even after all its batches settled. A user who has not exited yet still holds a record that names it, and the client rejects a record whose batcher is not in the config.
{% endhint %}

## Atomic wallets

A wallet that lands several calls in one atomic bundle, such as an EIP-5792 `wallet_sendCalls` batch, can skip the router. Prepare the join with `walletMode: "atomic"`: you get one transfer per vault, straight to its batcher, and no grants.

```ts
const prepared = await client.prepareRedeem(
  { groupId: "stable", vaultId: "beta", amount: 500n },
  { walletMode: "atomic" },
);
if (prepared.atomic) {
  await sendBundle([...prepared.grants, ...prepared.calls]);
}
```

`sendBundle` stands in for your wallet's atomic batch call.

{% hint style="danger" %}
When `prepared.atomic` is `true`, send every call in one atomic bundle. If the calls go out one by one and the user stops partway, the vaults that were never joined show which vault the user picked. The SDK's send methods never send an atomic join, so `walletMode` is only on the `prepare*` methods.
{% endhint %}

An atomic join returns no join record, because you send it yourself. Build the record from your indexer, as described below.

## Send through your own pipeline

A host with its own transaction pipeline (a queue, a bundler, a custody service) uses the `prepare*` methods. Each returns a `PreparedVaultAction`, which is plain data:

- `grants`: ERC-7984 operator grants the account lacks. Send them first, in any order.
- `calls`: the action itself. Send them after the grants.
- `sender`: the account that must send the calls, or `null` when anyone may.
- `expiresAt`: when the earliest grant expires. Prepare again after this time.

Each grant and call is `{ to, data }`. Send it to `to` with `data` and no value.

```ts
import { createVaultClient, type PreparedVaultAction } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

const client = createVaultClient(sdk, VAULTS);

async function sendPrepared(prepared: PreparedVaultAction) {
  for (const grant of prepared.grants) await sendTransaction(grant);
  for (const call of prepared.calls) await sendTransaction(call);
}

const prepared = await client.prepareDeposit(
  { groupId: "stable", vaultId: "beta", amount: 1_000_000n },
  { account: "0xUser", skipChecks: ["balance"] },
);
await sendPrepared(prepared);
```

`sendTransaction` stands in for your pipeline. The prepare methods take these options:

- `account`: the account the join comes from. It defaults to the signer's. The balance check decrypts as the signer, so any other account needs `skipChecks: ["balance"]`.
- `skipChecks`: `"balance"` skips the balance check, for a host that already gates the amount on a balance it shows. `"config"` skips the one-time check of the config against the chain and the router's registry listing, for a host that verified them itself. The paused check always runs.
- `walletMode`: `"sequential"` (default) or `"atomic"`. See [Atomic wallets](#atomic-wallets).

After you send, call `invalidateAfterVaultAction(queryClient, { chainId, groupId })` so the hooks read fresh data.

### Build the join record from your indexer

The `prepare*` methods do not return a join record, and the SDK does not export event decoding. A host gets batch ids from its own indexer of the batchers' `Joined(batchId, account, amount)` events, then builds the record:

```ts
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

const record: VaultRecord<typeof VAULTS> = {
  v: 1,
  chainId: 1,
  groupId: "stable",
  direction: "deposit",
  account: "0xUser",
  legs: [
    { vaultId: "alpha", batcher: "0xAlphaDeposit", batchId: 12n },
    { vaultId: "beta", batcher: "0xBetaDeposit", batchId: 7n },
  ],
};
```

The record must hold one leg per vault of the group, in config order, each with the batcher that leg actually joined: the vault's `depositBatcher` or `redeemBatcher` for the direction, or an entry of its [batcher history](#upgrade-a-batcher). Take the batcher from the `Joined` log's emitter, not from the config. `account` is the account the batchers credited: the sender for a multi-vault join, or the `beneficiary` in a group of one. The client throws `ConfigurationError` for a record that does not match the config.

With the record, the host reads the position and prepares the exit like any other app:

```ts
const position = await client.readPosition(record);
if (position.availableActions.includes("exit")) {
  await sendPrepared(await client.prepareExit(record));
}
```

`prepareExit`, `prepareDispatch` and `prepareFinalize` build their calls from the batch states at the time you call them. Prepare them right before you send.

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each position phase
- [Vault deposits and redemptions](deposits.md): the full flow with the SDK's signer
- [`VaultClient`](../../reference/sdk/VaultClient.md#prepare-methods): the prepare methods in full
