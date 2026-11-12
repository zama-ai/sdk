---
title: Handle wallet prompts, upgrades and custom sending
description: Wallet prompts, paused batchers, batcher upgrades, bundling wallets, and sending vault calls through your own pipeline.
---

# Handle wallet prompts, upgrades and custom sending

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This page covers what an integration needs beyond [Vault deposits and redemptions](deposits.md): planning wallet prompts, handling paused and upgraded batchers, and sending calls yourself. It uses the `STABLE` group from [step 1](deposits.md#1-define-a-group) of that guide.

## Wallet prompts

Each transaction is one wallet prompt. Most actions send one transaction. A group redemption can send several:

| Action                          | One vault   | Group of N vaults |
| ------------------------------- | ----------- | ----------------- |
| `deposit`                       | 1           | 1                 |
| `redeem`                        | 1           | **up to N + 1**   |
| `claim`, `dispatch`, `finalize` | 1 per batch | 1 per batch       |
| `quit` the whole join           | 1           | N                 |

A group redemption first approves the router as operator on each share token the account has not approved yet, one prompt each, then sends the join. An approval lasts 365 days, so redemptions within that time ask for none. To skip the approvals, use a [bundling wallet](#bundling-wallets). For why the router needs them, see [A group join goes through the vault router](README.md#a-group-join-goes-through-the-vault-router).

The router's address comes from `vaultRouterAddress` in the [chain preset](../../reference/sdk/network-presets.md). For a chain whose preset names none, set it on the chain you pass to the SDK, or group joins through the router throw `ConfigurationError`.

## Paused batchers

A paused batcher rejects joins. A group join sends a leg to every vault, so one paused batcher blocks every join of its group. `deposit` and `redeem` check this first and throw `VaultBatcherPausedError`, naming the paused vault. Claims and quits still work, so existing deposits are never stuck.

To disable the form before the user submits, read `paused` from [`readOpenBatches`](deposits.md#show-the-open-batches).

## Upgrade a batcher

When a vault's batcher is replaced, batches on the old one must stay readable, claimable and quittable. Replace the plain address with a `BatcherHistory` that keeps the old batcher as retired:

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

Joins keep landing on the old batcher until its batch `lastBatchId` is dispatched, then go to `latest`. The switch follows the chain, not the clock, so you can ship the new definition before it happens. Stored batches name their own batcher, so they keep working.

To upgrade again, move the current `latest` to the end of `retired` with its `lastBatchId`, and set the new `latest`.

{% hint style="warning" %}
Never remove a retired entry, even once its batches settled. Every batcher of a vault, retired ones included, must serve the same ERC-4626 vault with the same asset and share token.
{% endhint %}

## Bundling wallets

A wallet that lands several calls together or not at all, such as an EIP-5792 `wallet_sendCalls` batch, a Safe, or a smart account, can skip the router and its approvals. Prepare the join with `route: "direct"`, which returns one transfer per vault, straight to its batcher:

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
Send the direct calls of a group as one atomic bundle. Sent one by one, they can show which vault the user picked. See [A group join goes through the vault router](README.md#a-group-join-goes-through-the-vault-router).
{% endhint %}

## Send through your own pipeline

An app with its own transaction pipeline, such as a queue or a custody service, uses the `prepare*` methods. They read the chain and encrypt, and return plain calls for you to send:

```ts
import { invalidateAfterVaultAction } from "@zama-fhe/sdk/vaults";

const prepared = await vaults.prepareDeposit(STABLE, {
  vaultId: "beta",
  account: "0xUser",
  amount: 1_000_000n,
});
for (const call of prepared.calls) {
  await sendTransaction(call);
}
invalidateAfterVaultAction(queryClient);
```

`sendTransaction` stands in for your pipeline. Send the calls in order, from `account`: the encryption proofs are bound to it. Then call `invalidateAfterVaultAction` so the React hooks read fresh data. Store a prepared join only in the user's own storage, as [the privacy rules](README.md#a-group-hides-which-vault-you-chose) say. See [`PreparedJoin`](../../reference/sdk/VaultClient.md#preparedjoin) for its fields.

### Check the balance

`prepareDeposit` and `prepareRedeem` check the balance by default. The check decrypts as the SDK's signer, so it only works when `account` is the signer. For any other account, or with no signer, they throw `BalanceCheckUnavailableError` until you pass `skipBalanceCheck: true`.

{% hint style="warning" %}
**If you skip the check, check the balance yourself.** A join above the balance does not revert: it joins every batch with nothing and still costs the transaction. Follow [Decrypt every leg together](README.md#a-group-hides-which-vault-you-chose).
{% endhint %}

### Act on a batch

The batch actions take a `BatchRef`, except `prepareDispatch`, which acts on whatever batch is open on a batcher:

```ts
const claim = vaults.prepareClaim(batchRef, "0xUser");
const quit = vaults.prepareQuit(batchRef);
const dispatch = vaults.prepareDispatch({ chainId: 1, batcher });
const { call: finalize } = await vaults.prepareFinalize(batchRef);
```

`prepareClaim`, `prepareQuit` and `prepareDispatch` read nothing, so a batch may have changed state by the time you send. Read it with `readBatch` first and send only what its `actions` lists.

### Find the batches of a join

A prepared join cannot know its batch ids: they exist once the join is mined. Read them from the `Joined(batchId, account, amount)` events in the receipt, one per leg, emitted by the batcher in `prepared.legs[i].batcher`. With a `BatchRef` per leg, read and act on batches as any other app does.

## Next steps

- [Building a vault UI](building-a-ui.md): what to show and offer in each batch state
- [`VaultClient`](../../reference/sdk/VaultClient.md#prepare-a-join): the `prepare*` methods in full
- [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router): how the router fans one transaction out on-chain
