---
title: Vaults
description: How confidential ERC-4626 vaults work from the SDK — batches, keepers, and the privacy of a vault group.
---

# Vaults overview

The vault client deposits into and redeems from confidential ERC-4626 vaults. This page explains the three ideas the rest of the vault guides rely on: a deposit settles in a batch, a keeper moves batches forward, and a group hides which vault you chose. For the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault).

{% hint style="info" %}
Available in the Core SDK (`@zama-fhe/sdk/vaults`) and the React SDK (`@zama-fhe/react-sdk/vaults`). Both are separate subpaths, so apps that do not use vaults do not bundle them.
{% endhint %}

## A deposit settles in a batch, not in its transaction

A deposit is not done when its transaction is mined. The amount **joins** the open batch of a vault's batcher, and the batch then moves through four states:

| `state`      | What happened                                              | What the depositor can do          |
| ------------ | ---------------------------------------------------------- | ---------------------------------- |
| `pending`    | The batch is open and collects deposits.                   | `quit`, to take the deposit back   |
| `dispatched` | The batch was sent to the vault and waits for its result.  | Wait                               |
| `finalized`  | The batch settled at the vault's exchange rate.            | `claim`, to receive the shares     |
| `canceled`   | The batch did not go through.                             | `quit`, to take the deposit back   |

A redemption goes through the same states with the roles swapped: it joins with shares, and its claim pays out the asset.

So a join returns the **batch** each amount landed in, not a result. Your app stores those batches and reads them later to show progress and offer the next action.

## A keeper moves batches forward

A keeper is an off-chain service that watches the batchers. It dispatches each batch once it is old enough, finalizes it once the vault answers, and then claims for every depositor, or recovers their deposits from a canceled batch. In the normal flow the user only deposits and waits.

`dispatch`, `finalize` and `claim` are permissionless, so the SDK exposes them too. Offer them as a fallback when a keeper is late, not as steps of the normal flow.

## A group hides which vault you chose

A **vault group** is a set of vaults that take deposits in the same confidential asset. A join into a group sends a leg to every vault of the group: the vault you chose gets the amount, and the others get an encrypted zero. An observer sees the same transactions whichever vault you picked.

The SDK builds every group join this way. What it cannot enforce is up to your app:

- **Join through the group.** A vault can also be joined on its own, which is simpler but shows on-chain which vault was chosen.
- **Never change a group once users have joined it.** All users of a group must join the same vaults in the same order, or their transactions stop looking alike. To change the vaults, define a new group.
- **Quit every leg, or none.** A quit is sent by the user and is public. Quitting only the chosen vault's batch shows which vault it was.
- **Decrypt every leg together.** Decrypting only the chosen vault's balance or deposit tells the relayer which vault the user cares about.

These follow the router's [rules for clients](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#rules-for-clients).

## Send with the SDK, or build calls for your own pipeline

Every action exists in two forms:

- **A send method** — `deposit`, `redeem`, `claim`, `quit`, `dispatch`, `finalize`, or the matching React hook — signs with the SDK's signer and waits for the receipt. Most apps use these.
- **A `prepare*` method** — `prepareDeposit`, `prepareClaim`, and so on — returns plain `{ to, data, value }` calls for an app that sends transactions through its own pipeline: a queue, a custody service, or a wallet that bundles calls.

## Where to go next

🟨 Go to [**Vault deposits and redemptions**](deposits.md) to define a group, deposit, and follow the batches to the payout.

🟨 Go to [**Building a vault UI**](building-a-ui.md) for what to show and offer in each batch state.

🟨 Go to [**Advanced vault integration**](advanced.md) for wallet prompts, batcher upgrades, bundling wallets and your own pipeline.

For the API, see [**VaultClient**](../../reference/sdk/VaultClient.md) and the vault hooks in the [React reference](../../reference/react/README.md).

## Help center

Ask technical questions, discuss with the community, or report a bug.

- [Community forum](https://community.zama.org/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
- [Open an issue](https://github.com/zama-ai/sdk/issues) on the SDK repository
