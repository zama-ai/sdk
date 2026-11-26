---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

### Unshield

**Unshield hooks refresh balances when the unwrap was already finalized.** Any account can call `finalizeUnwrap`. When another tab or another account finalizes the request first, `useUnshield` and `useUnshieldAll` now refresh the balance queries on `UnshieldAlreadyFinalizedError`, as `useResumeUnshield` already did. Treat the error as completion. See [Unshield tokens](../guides/unshield-tokens.md#4-handle-interrupted-unshields).

**Interrupted unshields stay recoverable.** The SDK now saves the unwrap transaction hash as soon as the wallet returns it, instead of after the receipt, and keeps one entry per unshield, so a second unshield on the same token no longer overwrites the first. `getPendingUnshield()` / `usePendingUnshield` return the oldest pending one; after resuming it, the next one is returned. An entry whose unwrap reverted, or was replaced or cancelled in the wallet, is cleared instead of being reported, and an unwrap that is not mined yet no longer stalls `getPendingUnshield()`. `resumeUnshield()` no longer waits for such an unwrap: it throws the new `UnwrapNotMinedError` (`UNWRAP_NOT_MINED`) at once and keeps the entry. Entries move to a new storage key, so an older SDK still open in another tab cannot delete them. See [Unshield tokens](../guides/unshield-tokens.md#4-handle-interrupted-unshields).

**`GenericProvider.getTransactionReceipt`.** An optional method that returns a mined receipt, or `null`, without waiting. `ViemProvider`, `EthersProvider` and `WagmiProvider` implement it. See [GenericProvider](../reference/sdk/GenericProvider.md#gettransactionreceipt).

### Daemon

**The daemon image is now published as `ghcr.io/zama-ai/sdk/sdk-daemon`.** Update the image name in your deployment files, and use the new verify commands. See [Verify and pin the image](../native/operations/run-in-production.md#verify-and-pin-the-image).

**Daemon traffic is identifiable in telemetry.** Relayer requests made by the SDK daemon now report `runtime=daemon` instead of `node`, plus a `client` field (`go`, `rust`, or `unknown`) with the client language. Nothing else changes: no new identifiers are sent, and `ZAMA_SDK_TELEMETRY=off` on the daemon process still disables telemetry. See [SDK usage telemetry](../guides/telemetry.md) and [Deploy in production](../native/operations/run-in-production.md#telemetry).

### Vaults

**Several batchers per vault direction.** A vault's `batchers.deposit` and `batchers.redeem` take an address, or a list of addresses and `BatcherEntry` objects (`{ address, lastBatchId? }`). A join goes to the open batch that is dispatched next among the batchers that are not paused or closed, and `readOpenBatches` returns that batch. `openBatchesQueryOptions` and `useOpenBatches` refetch when that batch comes within a minute of its due time. `VaultBatcherPausedError` is now thrown only when no batcher of a vault is open. `readOpenBatches` also throws it, instead of `ConfigurationError`, when every batcher of a vault on its own is closed. The new `VaultBatcherReadFailedError` names the batcher and the vault when one cannot be read. `readBatch` no longer lists `dispatch` while the previous batch is in flight. See [Several batchers](../guides/vaults/advanced.md#several-batchers).

**A paused group member no longer blocks its group.** `prepareDeposit`, `prepareRedeem`, `deposit` and `redeem` leave out a group member whose batchers are all paused or closed, instead of throwing `VaultBatcherPausedError` for the whole group. They still throw it when the chosen vault takes no joins. `readOpenBatches` and `useOpenBatches` leave out a group member whose batchers are all closed, and throw `VaultBatcherPausedError` when every member is closed. `legs` and `batches` then have no entry for a vault left out, so match them by `vaultId`. See [Paused batchers](../guides/vaults/advanced.md#paused-batchers).

**A batcher whose batch ids start past 1 works from its first batch.** A batcher that continues a retired batcher's ids has no batch before its first one, and `batchState` reverts on that id. `readBatch`, `readOpenBatches` and every join now check the previous batch as the batcher's `dispatchBatch` does: a batch before it with no unwrap request does not hold it back. Before, they threw on the batcher's first batch.

**`BatcherHistory` and `RetiredBatcher` are deprecated.** A history reads as the list `[...retired, latest]`, so `latest` takes joins as soon as it is open. It no longer waits for the retired batchers to pass their `lastBatchId`. Replace `{ retired, latest }` with that list. Code that reads `vault.batchers` must also handle a list.

### Chains

**`bscTestnet` targets the real protocol.** The `bscTestnet` preset (chain ID `97`) now targets the Zama protocol on BNB Smart Chain testnet through the hosted testnet relayer, like `sepolia`. Use it with `web()` or `node()` instead of `cleartext()`. The preset includes the wrappers registry address, so token discovery needs no extra configuration.

**Breaking change for the BSC cleartext deployment:** the preset no longer carries that deployment's contract addresses or `executorAddress`. To keep using it, define a custom `FheChain` with its addresses and use `cleartext()`. See [What each chain includes](../reference/sdk/network-presets.md#what-each-chain-includes).
