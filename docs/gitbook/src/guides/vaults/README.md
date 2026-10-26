---
title: Vaults
description: Integrate confidential ERC-4626 vaults with the Zama SDK — single vaults and multi-vault groups.
---

# Vaults overview

**Welcome to the vault guides!**

These guides cover **integrating** confidential ERC-4626 vaults from the SDK — depositing, redeeming, and joining several vaults at once. For what a confidential vault is, how batching and settlement work on-chain, and the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault).

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

Core SDK usage imports from `@zama-fhe/sdk/vaults`; React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that use it.

## The three building blocks

- **`VaultBatcher`** mirrors one on-chain batcher contract directly, the way `Token` mirrors an ERC-7984 confidential token. Each vault has two directions — deposit and redeem — behind their own batcher.
- **`Vault`** pairs a deposit batcher and a redeem batcher into one ERC-4626-style object (`deposit`, `redeem`, …), and automates the operator approval the batcher needs before it can pull the joined amount. Most single-vault apps use this.
- **`VaultGroup`** joins several vaults in one transaction — the vault you chose gets the amount, the rest get an encrypted zero — so an observer cannot tell which vault received the deposit, provided every client follows the leg-list rules in [Vault groups](groups.md).

## Where to go next

🟨 Go to [**Vault deposits and redemptions**](deposits.md) for the full single-vault flow — create a vault, deposit, redeem, dispatch, and claim.

🟨 Go to [**Vault groups**](groups.md) to deposit into one of several vaults without revealing which one.

For the API surface, see [**Vault**](../../reference/sdk/Vault.md), [**VaultBatcher**](../../reference/sdk/VaultBatcher.md), and [**VaultGroup**](../../reference/sdk/VaultGroup.md) in the SDK reference, and the vault hooks in the [React reference](../../reference/react/README.md).

## Help center

Ask technical questions, discuss with the community, or report a bug.

- [Community forum](https://community.zama.org/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
- [Open an issue](https://github.com/zama-ai/sdk/issues) on the SDK repository
