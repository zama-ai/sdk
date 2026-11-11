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

A group names its chain, its asset and its vaults, in leg order:

```ts
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
```

A group holds from one vault up to `MAX_GROUP_VAULTS`. A join's FHE compute grows with its number of legs, and `MAX_GROUP_VAULTS` is what fits in one transaction. A group of one has nothing to hide a leg among, so it joins its batcher directly, without the router.

A multi-vault join sent one call at a time goes through the chain's router, `vaultRouterAddress` in the chain preset. Set `router` only for a chain whose preset names none. When the preset names a router, a different `router` throws `ConfigurationError`.

## Privacy rules

Every join covers the whole group. That is what hides the choice, and the client always does it. The rest is up to you:

- **Every join covers every vault.** `deposit` and `redeem` send a leg to each vault, in group order, and never drop a zero leg.
- **Every balance check covers every leg.** The balance check decrypts every token the legs spend, not only the chosen one. A lone decryption would tell the relayer which vault you care about.
- **Every user gets the same leg list.** All users of a group join the same vaults in the same order, so their transactions look alike. Do not reorder or change a group's vaults once users have joined it.
- **Quit every leg, or none.** Claims, quits, dispatches and settlements act on one batch each. A keeper dispatches, finalizes, claims and recovers for every depositor, so these reveal nothing about one user. A quit is different: the user sends it, and it is public. To take a deposit back from a pending batch, quit the batch of every leg of the join, not only the chosen one. The client does not enforce this.

These follow the [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients) of the router.

## Wallet prompts

The SDK's send methods send one transaction per call, so each call is one wallet prompt. The number depends on the action and the group's size:

| Action                          | Group of one | Group of N vaults |
| ------------------------------- | ------------ | ----------------- |
| `deposit`                       | 1            | 1                 |
| `deposit` with `beneficiary`    | up to 2      | not allowed       |
| `redeem`                        | 1            | **up to N + 1**   |
| `claim`, `dispatch`, `finalize` | 1 per batch  | 1 per batch       |
| `quit` the whole join           | 1            | N                 |

A multi-vault deposit is one transfer of the asset to the router, which splits it into legs. It needs no grant, but the router's registry must list the asset. The SDK checks this and throws `UnlistedConfidentialTokenError` instead of paying for a revert.

A multi-vault redemption is different. Each vault has its own share token, and the router pulls every one of them. So the account first grants the router an ERC-7984 operator approval on every share token it has not granted yet: one prompt each, then one prompt for the join.

{% hint style="warning" %}
**Make the N + 1 prompts visible to users.** The first redemption from a group of N vaults asks for up to N grants, then the join. Say so on the redeem form before the user starts, or use a [bundling wallet](#bundling-wallets).
{% endhint %}

A grant lasts a year, so later redemptions ask for none. A long grant is safe: the router only pulls a share token for a join that its holder sends, under an encryption proof bound to that holder. Nobody else can use the grant to move the shares.

## Paused batchers

Every join sends a leg to every vault, and one paused batcher reverts the whole join. So `deposit` and `redeem` read `paused()` on each batcher first and throw `VaultBatcherPausedError`, naming the paused vault. This check cannot be skipped. Claims and quits still work on a paused batcher, so existing deposits are never stuck.

## Upgrade a batcher

A vault's batcher can be replaced by a new one, for example to pick up a contract fix. Users with batches on the old batcher must still be able to read, claim and quit them, so your group keeps the old batcher as a retired entry. Replace the plain address with a `BatcherHistory`:

```ts
import { defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  vaults: [
    {
      id: "alpha",
      batchers: {
        deposit: {
          retired: [{ address: "0xAlphaDepositV1", lastBatchId: 41n }],
          latest: "0xAlphaDepositV2",
        },
        redeem: "0xAlphaRedeem",
      },
      share: "0xAlphaShare",
    },
    {
      id: "beta",
      batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
      share: "0xBetaShare",
    },
  ],
});
```

How the client uses it:

- **Joins switch on the batch, not the clock.** A join goes to the first retired batcher whose open batch is still at most its `lastBatchId`, and otherwise to `latest`. Joins keep landing on the old batcher until batch `lastBatchId` is dispatched, then go to the new one. You can ship the new group before the switch.
- **Stored batches keep their batcher.** A `BatchRef` names the batcher the leg joined, so `readBatch`, `claim` and `quit` work on a retired batcher as before.
- **`readOpenBatches` and `activeBatchers` report the active batcher**, so a form shows the batch the next join lands in.
- **Every batcher of a vault must serve the same vault.** On the first join, the client checks that each batcher, retired ones included, trades the group's asset for the vault's `share` against the same ERC-4626 vault. A mismatch throws `ConfigurationError`.

To upgrade again, append the current `latest` to the end of `retired` with its `lastBatchId`, and set the new `latest`. Keep `retired` oldest first.

{% hint style="warning" %}
Never remove a retired entry, even after all its batches settled. The client checks every batcher of the history against the chain, and a batcher used twice anywhere in the group throws `ConfigurationError`, so a removed address could later be reused by mistake.
{% endhint %}

## Bundling wallets

A wallet that lands several calls together or not at all, such as an EIP-5792 `wallet_sendCalls` batch, a Safe, or a smart account, can skip the router. Prepare the join with `walletMode: "bundle"`: you get one transfer per vault, straight to its batcher, and no grants.

```ts
const prepared = await vaults.prepareRedeem(
  STABLE,
  { vaultId: "beta", account: "0xUser", amount: 500n },
  { walletMode: "bundle" },
);
await sendBundle(prepared.calls);
```

`sendBundle` stands in for your wallet's atomic batch call.

{% hint style="danger" %}
When `prepared.route` is `"legs"` in a group of more than one, send the join calls in one atomic bundle. If they go out one by one and the user stops partway, the vaults that were never joined show which vault the user picked. The SDK's send methods never send a bundle, so `walletMode` is only on the `prepare*` methods.
{% endhint %}

## Send through your own pipeline

A host with its own transaction pipeline (a queue, a bundler, a custody service) uses the `prepare*` methods. `prepareDeposit` and `prepareRedeem` return a `PreparedJoin`, which is plain data:

- `calls`: one list in send order. First the grants the account lacks (`role: "grant"`, with `vaultId`, `token`, `operator` and `until`), then the join calls (`role: "join"`, with the `leg` each one funds).
- `route`: `"legs"` or `"router"`. With `"legs"` in a group of more than one, the join calls must land as one atomic bundle.
- `legs`: every vault of the group, in group order, with the batcher each leg joins.

Each call is `{ to, data, value: 0n }`.

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";
import { STABLE } from "./vaults";

const vaults = createVaultClient(sdk);

const prepared = await vaults.prepareDeposit(
  STABLE,
  { vaultId: "beta", account: "0xUser", amount: 1_000_000n },
  { skipChecks: ["balance"] },
);
for (const call of prepared.calls) {
  await sendTransaction(call);
}
```

`sendTransaction` stands in for your pipeline. The join methods take these options:

- `walletMode`: `"sequential"` (default) or `"bundle"`. See [Bundling wallets](#bundling-wallets).
- `skipChecks`: `"balance"` skips the balance check, which decrypts as the signer: an `account` other than the signer's needs it. `"config"` skips the one-time check of the group against the chain and the router's registry listing, for a host that verified them itself. The paused check always runs.

The batch actions take one batch each:

```ts
const claim = vaults.prepareClaim({ batcher, batchId, account: "0xUser" });
const quit = vaults.prepareQuit({ batcher, batchId });
const dispatch = vaults.prepareDispatch({ batcher });
const { call: finalize } = await vaults.prepareFinalize({ chainId: 1, batcher, batchId });
```

`prepareClaim`, `prepareQuit` and `prepareDispatch` read nothing, so read the batch with `readBatch` right before you send them. `prepareFinalize` throws `VaultBatchNotDispatchedError` when the batch is not dispatched.

After you send, call `invalidateAfterVaultAction(queryClient)` so the hooks read fresh data.

### Find the batches of a join

The `prepare*` methods do not return batch ids, because they are known only once the join is mined. A host gets them from its own indexer of the batchers' `Joined(batchId, account, amount)` events: one per leg, emitted by the batcher in `prepared.legs[i].batcher`. `account` is the account the batchers credited: the sender, or the `beneficiary` in a group of one. With the `BatchRef` of each leg, the host reads and acts on batches like any other app:

```ts
const batch = await vaults.readBatch({ chainId: 1, batcher, batchId, account: "0xUser" });
if (batch.actions.includes("claim")) {
  await sendTransaction(vaults.prepareClaim({ batcher, batchId, account: "0xUser" }));
}
```

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each batch state
- [Vault deposits and redemptions](deposits.md): the full flow with the SDK's signer
- [`VaultClient`](../../reference/sdk/VaultClient.md#prepare-a-join): the prepare methods in full
