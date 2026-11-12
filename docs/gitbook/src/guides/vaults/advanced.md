---
title: Advanced vault integration
description: Privacy rules, wallet prompts, batcher upgrades, bundling wallets, and sending vault calls through your own pipeline.
---

# Advanced vault integration

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This page covers what [Vault deposits and redemptions](deposits.md) leaves out: the privacy rules of a group, the wallet prompts each action takes, batcher upgrades, bundling wallets, and sending through your own transaction pipeline. It uses the `STABLE` group defined in [step 1](deposits.md#1-define-a-group) of that guide.

For how the on-chain router fans one transaction out across several batchers, see the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page and the [router interface](https://docs.zama.org/protocol/confidential-vault/reference/router-interface).

## Privacy rules

Every join sends a leg to every vault of its group: the vault you chose gets the amount, and the others get an encrypted zero. An observer cannot tell which vault received the money. The client always does this. The rest is up to you:

- **Every join covers every vault.** `deposit` and `redeem` send a leg to each vault, in group order, and never drop a zero leg.
- **Every balance check covers every leg.** The balance check decrypts every token the legs spend, not only the chosen one. A lone decryption would tell the relayer which vault you care about.
- **Every user gets the same leg list.** All users of a group join the same vaults in the same order, so their transactions look alike. Do not reorder or change a group's vaults once users have joined it. To change a group, define a new group.
- **Quit every leg, or none.** Claims, quits, dispatches and settlements act on one batch each. A keeper dispatches, finalizes, claims and recovers for every depositor, so these reveal nothing about one user. A quit is different: the user sends it, and it is public. To take a deposit back from a pending batch, quit the batch of every leg of the join, not only the chosen one. The client does not enforce this.

These follow the [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients) of the router.

## Group size and the router

A group holds from one vault up to `MAX_GROUP_VAULTS`. A join's FHE compute grows with its number of legs, and `MAX_GROUP_VAULTS` is what fits in one transaction. A group of one, or a vault joined on its own, has nothing to hide a leg among, so it joins its batcher directly, without the router.

A multi-vault join sent one call at a time goes through the chain's router, `vaultRouterAddress` in the chain preset. A group names no router. For a chain whose preset names none, set `vaultRouterAddress` on the chain you pass to the SDK; without it, a multi-vault join through the router throws `ConfigurationError`.

## Wallet prompts

The SDK's send methods send one transaction per call, so each call is one wallet prompt. The number depends on the action and the group's size:

| Action                          | One vault   | Group of N vaults |
| ------------------------------- | ----------- | ----------------- |
| `deposit`                       | 1           | 1                 |
| `redeem`                        | 1           | **up to N + 1**   |
| `claim`, `dispatch`, `finalize` | 1 per batch | 1 per batch       |
| `quit` the whole join           | 1           | N                 |

A multi-vault deposit is one transfer of the asset to the router, which splits it into legs. It needs no operator approval, but the router's registry must list the asset, or the router rejects the transfer.

A multi-vault redemption is different. Each vault has its own share token, and the router pulls every one of them. So the account first approves the router as ERC-7984 operator on every share token it has not approved it on yet: one prompt each, then one prompt for the join.

{% hint style="warning" %}
**Make the N + 1 prompts visible to users.** The first redemption from a group of N vaults asks for up to N operator approvals, then the join. Say so on the redeem form before the user starts, or use a [bundling wallet](#bundling-wallets).
{% endhint %}

An operator approval lasts a year, so later redemptions ask for none. A long approval is safe: the router only pulls a share token for a join that its holder sends, under an encryption proof bound to that holder. Nobody else can use the approval to move the shares.

## Paused batchers

Every join sends a leg to every vault, and one paused batcher reverts the whole join. So `deposit` and `redeem` read `paused()` on each batcher first and throw `VaultBatcherPausedError`, naming the paused vault. This check cannot be skipped. Claims and quits still work on a paused batcher, so existing deposits are never stuck. To show a paused vault before the user submits, read the group with [`readOpenBatches`](deposits.md#show-when-the-next-batch-closes).

## Upgrade a batcher

A vault's batcher can be replaced by a new one, for example to pick up a contract fix. Users with batches on the old batcher must still be able to read, claim and quit them, so the vault keeps the old batcher as a retired entry. Replace the plain address with a `BatcherHistory`:

```ts
import { defineVault } from "@zama-fhe/sdk/vaults";

export const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: {
    deposit: {
      retired: [{ address: "0xAlphaDepositV1", lastBatchId: 41n }],
      latest: "0xAlphaDepositV2",
    },
    redeem: "0xAlphaRedeem",
  },
});
```

How the client uses it:

- **Joins switch on the batch, not the clock.** A join goes to the first retired batcher whose open batch is still at most its `lastBatchId`, and otherwise to `latest`. Joins keep landing on the old batcher until batch `lastBatchId` is dispatched, then go to the new one. You can ship the new vault definition before the switch.
- **Stored batches keep their batcher.** A `BatchRef` names the batcher the leg joined, so `readBatch`, `claim` and `quit` work on a retired batcher as before.
- **`readOpenBatches` reports the active batcher**, so a form shows the batch the next join lands in.
- **Every batcher of a vault must serve the same vault.** Each batcher, retired ones included, must trade the group's confidential asset for the vault's confidential share against the same ERC-4626 vault. The SDK reads each leg's token from its active batcher and checks only that every deposit batcher takes the same asset.

To upgrade again, append the current `latest` to the end of `retired` with its `lastBatchId`, and set the new `latest`. Keep `retired` oldest first.

{% hint style="warning" %}
Never remove a retired entry, even after all its batches settled. `defineVault` and `defineVaultGroup` refuse a batcher used twice, so keeping every entry stops an old address from being reused by mistake.
{% endhint %}

## Bundling wallets

A wallet that lands several calls together or not at all, such as an EIP-5792 `wallet_sendCalls` batch, a Safe, or a smart account, can skip the router. Prepare the join with `route: "direct"`: you get one transfer per vault, straight to its batcher, and no operator approvals.

```ts
const prepared = await vaults.prepareRedeem(
  STABLE,
  { vaultId: "beta", account: "0xUser", amount: 500n },
  { route: "direct" },
);
await sendBundle(prepared.calls);
```

`sendBundle` stands in for your wallet's atomic batch call.

{% hint style="danger" %}
When `prepared.route` is `"direct"` in a group of more than one, send the join calls in one atomic bundle. If they go out one by one and the user stops partway, the vaults that were never joined show which vault the user picked. The SDK's send methods never send a bundle, so the `route` option is only on the `prepare*` methods.
{% endhint %}

## Send through your own pipeline

A host with its own transaction pipeline (a queue, a bundler, a custody service) uses the `prepare*` methods. A join takes the `account` that will send its calls, and the SDK reads the chain and encrypts for that account.

The `prepare*` join methods check the balance by default, like the send methods. The check decrypts as the signer, so it runs only when `account` is the signer's. For any other account, or with no signer, the join throws `BalanceCheckUnavailableError` until you pass `skipBalanceCheck: true`. With it, the methods need no signer and no connected wallet.

{% hint style="warning" %}
**If you skip the balance check, check the balance yourself.** A join with a short balance does not revert: it joins every batch with nothing and still costs the transaction. Decrypt the balance of every token the legs spend, not only the chosen one. A lone decryption tells the relayer which vault was picked.
{% endhint %}

`prepareDeposit` and `prepareRedeem` return a `PreparedJoin`, which is plain data:

- `calls`: every call in send order. The operator approvals the account lacks come first (`kind: "operatorApproval"`, with `vaultId`, `operator` and `until`, sent to the token the approval is on), in leg order. The join calls follow (`kind: "join"`, with the `leg` each one funds).
- `route`: `"direct"` or `"router"`. With `"direct"` in a group of more than one, the join calls must land as one atomic bundle.
- `legs`: every vault of the group, in group order, with the batcher each leg joins and the token it spends.

Each call is `{ to, data, value: 0n }`.

A prepared join also holds the chosen `vaultId` and the `amount` in cleartext, so an approval screen can show them. If you store it, keep only what your pipeline needs, and give `JSON.stringify` a replacer for its bigints.

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";
import { STABLE } from "./vaults";

const vaults = createVaultClient(sdk);

const prepared = await vaults.prepareDeposit(
  STABLE,
  { vaultId: "beta", account: "0xUser", amount: 1_000_000n },
  { skipBalanceCheck: true },
);
for (const call of prepared.calls) {
  await sendTransaction(call);
}
```

`sendTransaction` stands in for your pipeline. The join methods take these options:

- `route`: `"router"` (default) or `"direct"`. A group of one always takes `"direct"`. See [Bundling wallets](#bundling-wallets).
- `skipBalanceCheck`: `true` skips the balance check. The paused check always runs.

The batch actions take one batch each, as a `BatchRef` (`{ chainId, batcher, batchId }`). Dispatch acts on a batcher's open batch, so it takes a `BatcherRef` (`{ chainId, batcher }`):

```ts
const batch = { chainId: 1, batcher, batchId };
const claim = vaults.prepareClaim(batch, "0xUser");
const quit = vaults.prepareQuit(batch);
const dispatch = vaults.prepareDispatch({ chainId: 1, batcher });
const { call: finalize } = await vaults.prepareFinalize(batch);
```

`prepareClaim`, `prepareQuit` and `prepareDispatch` read nothing, so read the batch with `readBatch` right before you send them. `prepareFinalize` throws `VaultBatchNotDispatchedError` when the batch is not dispatched.

After you send, call `invalidateAfterVaultAction(queryClient)` so the hooks read fresh data.

### Find the batches of a join

The `prepare*` methods do not return batch ids, because they are known only once the join is mined. A host gets them from its own indexer of the batchers' `Joined(batchId, account, amount)` events: one per leg, emitted by the batcher in `prepared.legs[i].batcher`. `account` is the sender. With the `BatchRef` of each leg, the host reads and acts on batches like any other app:

```ts
const ref = { chainId: 1, batcher, batchId };
const batch = await vaults.readBatch(ref, "0xUser");
if (batch.actions.includes("claim")) {
  await sendTransaction(vaults.prepareClaim(ref, "0xUser"));
}
```

## Next steps

- [Vault deposits and redemptions](deposits.md): the full flow with the SDK's signer
- [Building a vault UI](building-a-ui.md): what to show and offer in each batch state
- [`VaultClient`](../../reference/sdk/VaultClient.md#prepare-a-join): the prepare methods in full
