---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Confidential ERC-4626 vault support

Both packages gain a `vaults` subpath — `@zama-fhe/sdk/vaults` and `@zama-fhe/react-sdk/vaults` — for depositing into and redeeming from confidential ERC-4626 vaults. Vault operations are batched on-chain: a deposit or redemption joins the currently open batch, anyone can dispatch the batch once it is old enough, and participants claim their shares or assets after finalization. The subpath is opt-in, so apps that don't use vaults don't bundle it.

`Vault` (`createVault`, or `useVault` in React) pairs a vault's deposit and redeem batchers behind ERC-4626-style `deposit` and `redeem` methods. Both grant the batcher an operator approval when one isn't already active, check the caller's confidential balance the way `Token.confidentialTransfer` does, encrypt the amount, and return the `batchId` they joined. The React hooks are `useDeposit` and `useRedeem`.

`VaultBatcher` (`createVaultBatcher` / `useVaultBatcher`) mirrors one batcher contract directly for the rest of the lifecycle: `batchState`, `timeUntilDispatchable`, `dispatchBatch`, `claim`, `quit` and `recover`, with matching `useBatchState`, `useTimeUntilDispatchable`, `useCurrentBatchId`, `useDispatchBatch`, `useClaim`, `useQuit` and `useRecover` hooks. `Vault` exposes its two batchers as `depositBatcher` and `redeemBatcher`, and resolves the underlying vault, asset and share tokens from them on first use.

See [Vault deposits and redemptions](../guides/vault-deposits.md) for the full flow.

## Vault groups over the multi-vault router

`VaultGroup` (`createVaultGroup`, or `useVaultGroup` in React) joins several confidential vaults that share one `cAsset` as a single leg list: `deposit` and `redeem` join _every_ member's batch, the chosen vault with the amount and the rest with an encrypted zero, so the choice of vault stays private. A group of two or more submits through the on-chain `VaultBatcherConfidentialRouter` in one transaction — pushed for a deposit, pulled for a redemption. The React hooks are `useGroupDeposit` and `useGroupRedeem`.

A group deposit throws the new `UnlistedConfidentialTokenError` when the router's registry does not list the asset; `VaultGroup.isAssetListed()` gives the same answer without throwing. Both directions throw the new `VaultBatcherPausedError`, naming the member, when any batcher a leg would join is paused. Every submission through the router, deposit or redemption, surfaces as a `VaultSubmitted` event with `vaultOperation: "routerJoin"` tagged with the router's address.

See [Vault groups](../guides/vault-groups.md).

## Permit signatures with a 0/1 recovery byte

`parseSignedDecryptionPermit` (and `sdk.permits.registerPermit`, which uses it) now accepts 65-byte permit signatures whose recovery byte is `0`/`1` as well as `27`/`28`. The SDK normalizes the byte before the permit is verified; signatures already in `27`/`28` form and longer ERC-1271 signatures are unchanged.

## New chain preset: T-Rex Zenith testnet

`zenithTrexTestnet` (chain ID `936486`) joins the built-in chain presets in `@zama-fhe/sdk/chains`. It targets T-Rex's testnet instance on Zenith EVM, a Reth-based chain with Canton-mediated finality, and carries the addresses of a cleartext protocol deployment: ACL, `CleartextFHEVMExecutor`, KMS and input verifiers, and a wrapper registry with cUSDC/cUSDT mock pairs. Like `hoodi`, `ingenTestnet` and `bscTestnet` it has no hosted relayer, so pair it with the [`cleartext()` transport](../reference/sdk/RelayerCleartext.md). Its registry address is also included in the deprecated `DefaultRegistryAddresses` map. See [Chain presets](../reference/sdk/network-presets.md).
