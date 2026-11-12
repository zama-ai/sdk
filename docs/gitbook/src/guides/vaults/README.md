---
title: Vaults
description: Integrate confidential ERC-4626 vaults with the Zama SDK — one client for single vaults and multi-vault groups.
---

# Vaults overview

**Welcome to the vault guides!**

These guides cover **integrating** confidential ERC-4626 vaults from the SDK: depositing, redeeming, following a batch, and getting the money out. For what a confidential vault is, how batching and settlement work on-chain, and the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault).

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

Core SDK usage imports from `@zama-fhe/sdk/vaults`. React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that use it.

## How it works

A vault deposit is not done when the transaction is mined. The amount joins a **batch**. Later, the batch is **dispatched** to the vault and **finalized** with the vault's exchange rate. The deposit is then **claimed**, which pays out the shares.

The SDK gives you one client for all of it:

1. **Describe each group once** with `defineVaultGroup`. Vaults that take deposits in the same confidential asset form a **group**. For one vault on its own, use `defineVault`.
2. **Create a client** with `createVaultClient(sdk)`, or `useVaultClient()` in React. It holds no config, so one client serves every group and chain.
3. **Join**: `deposit` or `redeem` returns the batch each leg landed in. Store them.
4. **Follow each batch**: `readBatch(batchRef)` returns the batch's `state` and the `actions` you can send now.
5. **Get the money out**: a keeper claims a finalized batch for every depositor. `claim` is the fallback, and `quit` takes a deposit back from a batch that is still pending.

```ts
import { createVaultClient, defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  vaults: [
    { id: "alpha", batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" } },
    { id: "beta", batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" } },
  ],
});

const vaults = createVaultClient(sdk);

const { batches } = await vaults.deposit(STABLE, { vaultId: "beta", amount: 1_000_000n });
const beta = batches.find((batch) => batch.vaultId === "beta");
if (beta !== undefined) {
  const batch = await vaults.readBatch(beta, "0xUser");
  console.log(batch.state, batch.actions);
}
```

## Privacy: every join covers the whole group

Every join sends a leg to every vault of its group. The vault you chose gets the amount, and the others get an encrypted zero. An observer sees the same transactions whichever vault you picked. This is what hides the choice.

The rest is up to you, most of all: to take a deposit back, quit every leg of the join, not only the chosen one. See [Privacy rules](advanced.md#privacy-rules).

## Two ways to send

- **Your app sends with the SDK's signer.** Call `deposit`, `redeem`, `claim`, `quit`, `dispatch` and `finalize`, or the React hooks. The SDK signs, waits for receipts, and returns the batch each leg landed in. Most dapps use this.
- **Your app has its own transaction pipeline.** Call `prepareDeposit`, `prepareRedeem`, `prepareClaim`, `prepareQuit`, `prepareDispatch` or `prepareFinalize`. Each returns plain calls as `{ to, data, value }`. You send them. See [Send through your own pipeline](advanced.md#send-through-your-own-pipeline).

## Where to go next

🟨 Go to [**Vault deposits and redemptions**](deposits.md) for the full flow: define a group, deposit, store the batches, follow them, and get the money out.

🟨 Go to [**Advanced vault integration**](advanced.md) for privacy rules, wallet prompts, batcher upgrades, bundling wallets, and sending through your own pipeline.

🟨 Go to [**Building a vault UI**](building-a-ui.md) for what to show for each batch state, and what to offer.

For the API surface, see [**VaultClient**](../../reference/sdk/VaultClient.md) in the SDK reference, and [`useVaultClient`](../../reference/react/useVaultClient.md), [`useBatch`](../../reference/react/useBatch.md) and the other vault hooks in the [React reference](../../reference/react/README.md).

## Help center

Ask technical questions, discuss with the community, or report a bug.

- [Community forum](https://community.zama.org/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
- [Open an issue](https://github.com/zama-ai/sdk/issues) on the SDK repository
