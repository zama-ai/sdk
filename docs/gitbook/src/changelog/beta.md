---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Daemon

**Experimental Go and Rust clients.** Go and Rust services can use the SDK through native clients that talk to a local SDK daemon over a private Unix socket. The clients encrypt inputs, decrypt values (including public and delegated decryption), manage permits, prepare unsigned transactions for external signing, and grant or revoke on-chain decryption delegation through your wallet. Token workflows are not available in the clients yet.

- **Artifacts:** the `ghcr.io/zama-ai/sdk-daemon` Docker image, the Go module `github.com/zama-ai/sdk/clients/go/v3`, and the Rust crate `zama_sdk`. Run the image and the client at exactly the same version; see [client and daemon compatibility](../native/reference/client-and-daemon-compatibility.md).
- **Guides:** Go and Rust tabs in [Configuration](../guides/configuration.md), [Encrypt & decrypt](../guides/encrypt-decrypt.md), [Delegated decryption](../guides/delegated-decryption.md), [Offline signing](../guides/offline.md), [Handle errors](../guides/handle-errors.md), [Local development](../guides/local-development.md), [Authentication](../guides/authentication.md), and [Decrypt values from event logs](../guides/decrypt-from-event-logs.md).
- **Deployment:** [Deploy in production](../native/operations/run-in-production.md), [Monitor and troubleshoot](../native/operations/monitor-and-troubleshoot.md), and [Upgrade the daemon](../native/operations/upgrade-and-recover.md).
- **Signed, scanned image:** the daemon image is built on Docker Hardened Images, every release digest is scanned with Trivy before it is tagged, and the image carries signed build provenance and an SBOM. Verify a release with `gh attestation verify` or cosign and pin it by digest with `ZAMA_SDK_DAEMON_DIGEST`; see [Verify and pin the image](../native/operations/run-in-production.md#verify-and-pin-the-image). Published images are re-scanned daily.

Start with the [Go quick start](../native/tutorials/go-quick-start.md) or the [Rust quick start](../native/tutorials/rust-quick-start.md).

## Vault groups over the multi-vault router

`VaultGroup` (`createVaultGroup`, or `useVaultGroup` in React) joins several confidential vaults that share one `cAsset` as a single leg list: `deposit` and `redeem` join _every_ member's batch, the chosen vault with the amount and the rest with an encrypted zero, so the choice of vault stays private. A group of several vaults submits through the on-chain `VaultBatcherConfidentialRouter` in one transaction — pushed for a deposit, pulled for a redemption. The React hooks are `useGroupDeposit` and `useGroupRedeem`.

A group deposit throws the new `UnlistedConfidentialTokenError` when the router's registry does not list the asset; `VaultGroup.isAssetListed()` gives the same answer without throwing. Both directions throw the new `VaultBatcherPausedError`, naming the member, when any batcher a leg would join is paused. Every submission through the router, deposit or redemption, surfaces as a `VaultSubmitted` event with `vaultOperation: "routerJoin"` tagged with the router's address; a group of one joins its batcher directly and surfaces as `vaultOperation: "join"` tagged with the batcher.

If the SDK cannot match a `Joined` event in the mined transaction's receipt to every leg, the new `VaultGroupJoinUnconfirmedError` carries the transaction hash, the receipt, the batch ids it could read and the members it could not match. The router is all-or-nothing, so the transaction either reverted or joined every leg; look it up before resubmitting.

See [Vault groups](../guides/vaults/groups.md).

## Typed errors for the protocol's FHE compute limits

The protocol caps the FHE compute, measured in HCU, that a transaction and a block can use. A write whose gas estimation hits one of them now throws a typed error instead of a bare `TransactionRevertedError`, from `submitTransaction`-backed methods and from `sdk.offline.prepare` alike: `HcuBlockLimitExceededError` (`HCU_BLOCK_LIMIT_EXCEEDED`) when the block has too little left, which is retryable in the next block, and `HcuTransactionLimitExceededError` (`HCU_TRANSACTION_LIMIT_EXCEEDED`) when the transaction needs more HCU, in total or in one sequential chain, than one transaction may use, which a retry cannot fix.

A transaction that is mined and then reverts now throws `TransactionRevertedError` instead of returning a result. `TransactionReceipt` gained an optional `status` (`"success"` or `"reverted"`); the viem, ethers and wagmi providers fill it.

See [Errors](../reference/sdk/errors.md#hcublocklimitexceedederror).

## Settle a dispatched batch yourself

New `VaultBatcher.finalize(batchId)` (`useFinalize` in React, `finalizeMutationOptions` for TanStack Query). A keeper, an off-chain service that watches batches, normally finalizes a dispatched batch; when it has not, any account can now settle the batch from the SDK: `finalize` reads the batch's unwrap request, publicly decrypts the amount it released, and submits `dispatchBatchCallback` with the cleartext and its proof. Past the batch's callback deadline the same call cancels the batch. The submission surfaces as a `VaultSubmitted` event with `vaultOperation: "finalize"`. `VaultBatcher.unwrapRequestId(batchId)` exposes the underlying read. `finalize` and `prepareFinalize` read the batch state first and throw the new `VaultBatchNotDispatchedError` when the batch is not `Dispatched`, for example because a keeper already finalized it, before any decryption. New `VaultBatcher.timeUntilCallbackDeadline(batchId)` (`useTimeUntilCallbackDeadline`, `timeUntilCallbackDeadlineQueryOptions`) reads the seconds until a dispatched batch reaches its callback deadline: `0` once it has, when `finalize` cancels instead of settling, and `null` outside `Dispatched`.

## Vault groups for your own transaction layer

`VaultGroup.prepareDeposit` and `VaultGroup.prepareRedeem` do everything `deposit` and `redeem` do up to the send — the pre-flight, the balance check, the encryptions — and return the calls, the legs, the operator grants a router redemption relies on, and a `decodeJoins` helper for the mined receipt. An app that signs through its own pipeline (a transaction queue, a bundler, an EIP-5792 batch) sends them itself. The new `delivery` option picks between one transaction through the router and one transfer per member straight to its batcher, the shape an atomic bundle can land privately; `account` prepares for a given account without a signer; `skipPreflight` trusts a group the host verified, though `paused()` is always read. The balance check decrypts as the signer, so an `account` other than the signer's throws `ConfigurationError` unless `skipBalanceCheck` is passed. `VaultBatcher.prepareFinalize` does the same for a settlement.

`VaultGroup.missingOperators(prepared)` returns the grants in `requiredOperators` the account lacks at the current block, and `redeem` uses it; its default `operatorUntil` is the chain's current time plus one hour. The pure `decodeVaultGroupJoins({ legs, account }, logs)` does what `prepared.decodeJoins` does from saved data, so a host can decode after a reload. `invalidateAfterGroupJoin(queryClient, legs)` invalidates each leg's token balance and batch reads, as the group hooks do.

A group may now hold a single vault, which joins its batcher directly, so `router` is optional. A member's config can give its `cShare`, which spares a read and feeds the new `VaultGroup.redeemOperators()` and its config-only counterpart `vaultGroupRedeemOperators(config)`, for code that has the config but no SDK instance.

The `vaults` subpath also exports the pure call builders these are built on — `routerJoinContract`, `encodeAllocationData` and `tokenWrapperRegistryContract`, with the `EncryptedAllocationLeg` type — plus `dispatchBatchCallbackContract`, and `unwrapRequestIdContract`. The root entry now exports `confidentialTransferAndCallContract`, `confidentialTransferFromAndCallContract` and `unwrapAmountContract`. See [Vault groups](../guides/vaults/groups.md#using-your-own-transaction-layer).

## Vault joins without an operator grant

`Vault.deposit`, `Vault.redeem`, `VaultBatcher.join` and their hooks (`useDeposit`, `useRedeem`, `useJoin`) now send the amount to the batcher with `confidentialTransferAndCall` when they credit the caller. They no longer grant the batcher an ERC-7984 operator approval first, so a deposit takes one wallet prompt instead of two. A join for another `beneficiary` still goes through the batcher's `join`, which pulls the amount, so `Vault` still grants the approval in that case, and `operatorUntil` applies only there. The transaction now goes to the token rather than the batcher, so a host that allowlists call targets (a session-key or custody policy, for example) needs to allow the token. Existing operator approvals are left in place. Revoke one with `Token.setOperator(batcher, 0)` if you no longer need it.

## Vault groups only submit through the chain's router

The Ethereum mainnet and Sepolia presets gain `vaultRouterAddress`, the one multi-vault router on each chain. A `VaultGroup` `"router"` submission now throws `ConfigurationError` when the group's `router` is a different address, before it encrypts or asks for a signature, and also with `skipPreflight`. Set `allowCustomRouter: true` in the group config for a router you deployed yourself. The check uses the `vaultRouterAddress` of the chain the SDK is configured with, so a chain config that sets its own takes precedence. `"legs"` deliveries, which never touch the router, and chains whose config names no router are not checked.

## Opt out of clearing credentials on wallet account changes

New `clearCredentialsOnWalletChange` option on `createConfig`. By default (`true`) the SDK keeps its existing behavior: switching wallet accounts, locking the wallet, or disconnecting wipes the previous account's transport key pair, permits, and decrypt cache. Set it to `false` to keep them. Storage is keyed per signer address and a permit is only accepted from the address that signed it, so one account can never use another's entries; keeping them lets a multi-wallet user switch A → B → A without signing a new permit or re-decrypting, and stops wallets that emit an empty account list on auto-lock (Rabby, Brave) from wiping credentials on every lock.

- **With `clearCredentialsOnWalletChange: false`:** permits still expire after `permitTTL` and transport key pairs after `transportKeyPairTTL`; cached decrypts stay until the app clears them. For an explicit sign-out, call `sdk.permits.clear()` or `useClearCredentials` before disconnecting the wallet. They need a connected wallet account to know which signer to clear.
- **Go and Rust clients:** unchanged. `UpdateAccount` / `update_account` still clear the previous account's credentials; the option is not exposed to native clients yet.

See [Wallet account changes](../concepts/permit-model.md#wallet-account-changes) in the Permit Model.

## Permit signing with browser extensions that patch `BigInt`

`ViemSigner` and `WagmiSigner` now convert the typed-data domain `chainId` to a number and every `bigint` value in the message to a decimal string before calling viem. Browser extensions that patch how `bigint` is JSON-serialized made viem send the permit's `chainId` as `"1n"`, and the wallet rejected the signature with `chainId should be same as current chainId`; with no `bigint` left in the request, such a patch has nothing to act on. Signatures are unchanged, and `EthersSigner` was never affected.

## Telemetry as query parameters

`createConfig` now takes `telemetry: "header" | "query" | "off"`. The default, `"header"`, keeps sending the `x-zama-sdk-*` usage headers. `"query"` sends the same four fields as `zama_sdk_*` query parameters instead, for backend proxies and edges that rebuild or strip request headers. `"off"` sends nothing; `true` and `false` still work as `"header"` and `"off"`. On Node.js, `ZAMA_SDK_TELEMETRY` takes the same three values, case-insensitive, and switches the mode or turns telemetry off for the whole process; it cannot turn on what the config disabled. See [SDK usage telemetry](../guides/telemetry.md).

## Amoy mock registry and tokens removed

The mock wrappers registry and mock confidential tokens on Polygon Amoy are no longer maintained, so the SDK no longer ships them. `polygonAmoy.registryAddress` is now `undefined`, Amoy is removed from the deprecated `DefaultRegistryAddresses` map, and the `example-polygon-amoy` app is removed. The `polygonAmoy` preset stays available for the base protocol: encrypting inputs and decrypting values on Amoy work as before. If you deploy your own registry on Amoy, pass its address via `registryAddresses` when creating a `WrappersRegistry`, or set `registryAddress` on the chain definition. The Polygon mainnet registry and wrappers are unchanged.

## InGen testnet removed

The SDK no longer supports the T-Rex InGen testnet (chain ID `364301`). The `ingenTestnet` preset is removed from `@zama-fhe/sdk/chains`, from the built-in `chains` map and from the deprecated `DefaultRegistryAddresses`, and the `example-ingen` app is removed. Use `zenithTrexTestnet`, `hoodi` or `bscTestnet` for a cleartext testnet.
