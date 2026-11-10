---
title: Vaults
description: Integrate confidential ERC-4626 vaults with the Zama SDK — one client for single vaults and multi-vault groups.
---

# Vaults overview

**Welcome to the vault guides!**

These guides cover **integrating** confidential ERC-4626 vaults from the SDK: depositing, redeeming, following a position, and getting the money out. For what a confidential vault is, how batching and settlement work on-chain, and the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault).

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

Core SDK usage imports from `@zama-fhe/sdk/vaults`. React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that use it.

## How it works

A vault deposit is not done when the transaction is mined. The amount joins a **batch**. Later, the batch is **dispatched** to the vault and **finalized** with the vault's exchange rate. The user then **exits** the position to receive their shares.

The SDK gives you one client for all of it:

1. **Describe your vaults once** with `defineVaults`. Vaults that take deposits in the same confidential asset form a **group**. A single vault is a group of one.
2. **Create a client** with `createVaultClient(sdk, VAULTS)`, or `useVaultClient(VAULTS)` in React.
3. **Join**: `deposit` or `redeem` returns a **join record**. Store it.
4. **Follow the position**: `readPosition(record)` returns the position's `phase` and the actions you can send now.
5. **Exit**: `exit(record)` pays out a settled position, or refunds one that has not settled.

```ts
import { createVaultClient, defineVaults } from "@zama-fhe/sdk/vaults";

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

const client = createVaultClient(sdk, VAULTS);

const { record } = await client.deposit({ groupId: "stable", vaultId: "beta", amount: 1_000_000n });
const position = await client.readPosition(record);
if (position.availableActions.includes("exit")) {
  await client.exit(record);
}
```

## Privacy: every join covers the whole group

Every join sends a leg to every vault of its group. The vault you chose gets the amount, and the others get an encrypted zero. Every exit covers every leg. An observer sees the same transactions whichever vault you picked.

The client has no way to act on part of a join. Joining, exiting or decrypting one leg alone would show which vault was picked, so the API does not offer it.

## Two ways to send

- **Your app sends with the SDK's signer.** Call `deposit`, `redeem`, `exit`, `dispatch` and `finalize`, or the React hooks. The SDK signs, waits for receipts, and returns the join record. Most dapps use this.
- **Your app has its own transaction pipeline.** Call `prepareDeposit`, `prepareRedeem`, `prepareExit`, `prepareDispatch` or `prepareFinalize`. Each returns plain data: `grants`, then `calls`, as `{ to, data }`. You send them, and you get batch ids for your records from your own indexer. See [Send through your own pipeline](groups.md#send-through-your-own-pipeline).

## Where to go next

🟨 Go to [**Vault deposits and redemptions**](deposits.md) for the full flow: define the config, deposit, store the record, follow the position, and exit.

🟨 Go to [**Vault groups**](groups.md) for groups of several vaults, wallet prompts, batcher upgrades, atomic wallets, and sending through your own pipeline.

🟨 Go to [**Building a vault UI**](building-a-ui.md) for what to show for each position phase, and what to offer.

For the API surface, see [**VaultClient**](../../reference/sdk/VaultClient.md) in the SDK reference, and [`useVaultClient`](../../reference/react/useVaultClient.md), [`usePosition`](../../reference/react/usePosition.md) and the other vault hooks in the [React reference](../../reference/react/README.md).

## Help center

Ask technical questions, discuss with the community, or report a bug.

- [Community forum](https://community.zama.org/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
- [Open an issue](https://github.com/zama-ai/sdk/issues) on the SDK repository
