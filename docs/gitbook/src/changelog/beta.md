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

## Permit signatures with a 0/1 recovery byte

`parseSignedDecryptionPermit` (and `sdk.permits.registerPermit`, which uses it) now accepts 65-byte permit signatures whose recovery byte is `0`/`1` as well as `27`/`28`. The SDK normalizes the byte before the permit is verified; signatures already in `27`/`28` form and longer ERC-1271 signatures are unchanged.

## New chain preset: T-Rex Zenith testnet

`zenithTrexTestnet` (chain ID `936486`) joins the built-in chain presets in `@zama-fhe/sdk/chains`. It targets T-Rex's testnet instance on Zenith EVM, a Reth-based chain with Canton-mediated finality, and carries the addresses of a cleartext protocol deployment: ACL, `CleartextFHEVMExecutor`, KMS and input verifiers, and a wrapper registry with cUSDC/cUSDT mock pairs. Like `hoodi`, `ingenTestnet` and `bscTestnet` it has no hosted relayer, so pair it with the [`cleartext()` transport](../reference/sdk/RelayerCleartext.md). Its registry address is also included in the deprecated `DefaultRegistryAddresses` map. See [Chain presets](../reference/sdk/network-presets.md).

## Offline permits for more than 10 contracts

`sdk.offline.batchPreparePermits` and `sdk.permits.batchRegisterPermits` handle offline permit requests of any size. A permit holds at most 10 contracts, so `batchPreparePermits` returns one `PreparedPermit` per chunk of 10, and `batchRegisterPermits` takes the matching list of `{ prepared, signature }` pairs (`SignedPreparedPermit[]`) and registers them in order. The single-permit `preparePermit` and `registerPermit` are unchanged; `preparePermit` still rejects more than 10 contracts and now points at `batchPreparePermits`. React gains `useBatchPreparePermits` and `useBatchRegisterPermits`. See [Offline permits](../guides/offline.md#offline-permits).

## SDK usage telemetry headers

Relayer requests now carry four `x-zama-sdk-*` headers: the SDK version, the package driving it (`core` or `react`), the transport (`web` or `node`), and the public SDK method the request belongs to (`confidential-transfer`, `unshield`, `balance-of`, …). They label traffic the relayer already receives so the SDK team can see version adoption and per-operation error rates; no end-user data is ever included, and a self-hosted relayer simply ignores them. Telemetry is on by default and `createConfig({ telemetry: false })` turns it off; on Node.js, `ZAMA_SDK_TELEMETRY=0` does the same for a whole process. See [SDK usage telemetry](../guides/telemetry.md).

## Daemon

**Experimental Go and Rust clients.** Go and Rust services can use the SDK through native clients that talk to a local SDK daemon over a private Unix socket. The clients encrypt inputs, decrypt values (including public and delegated decryption), manage permits, prepare unsigned transactions for external signing, and grant or revoke on-chain decryption delegation through your wallet. Token workflows are not available in the clients yet.

- **Artifacts:** the `ghcr.io/zama-ai/sdk-daemon` Docker image, the Go module `github.com/zama-ai/sdk/clients/go/v3`, and the Rust crate `zama_sdk`. Run the image and the client at exactly the same version; see [client and daemon compatibility](../native/reference/client-and-daemon-compatibility.md).
- **Guides:** Go and Rust tabs in [Configuration](../guides/configuration.md), [Encrypt & decrypt](../guides/encrypt-decrypt.md), [Delegated decryption](../guides/delegated-decryption.md), [Offline signing](../guides/offline.md), [Handle errors](../guides/handle-errors.md), [Local development](../guides/local-development.md), [Authentication](../guides/authentication.md), and [Decrypt values from event logs](../guides/decrypt-from-event-logs.md).
- **Deployment:** [Deploy in production](../native/operations/run-in-production.md), [Monitor and troubleshoot](../native/operations/monitor-and-troubleshoot.md), and [Upgrade the daemon](../native/operations/upgrade-and-recover.md).

Start with the [Go quick start](../native/tutorials/go-quick-start.md) or the [Rust quick start](../native/tutorials/rust-quick-start.md).
