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

**HCU limit errors for native clients.** A write whose gas estimation hits one of the protocol's FHE compute (HCU) limits now fails with `HCU_BLOCK_LIMIT_EXCEEDED` (retryable) or `HCU_TRANSACTION_LIMIT_EXCEEDED` instead of `TRANSACTION_REVERTED`. A write whose broadcast outcome is uncertain still fails with `TRANSACTION_OUTCOME_UNKNOWN`.

Start with the [Go quick start](../native/tutorials/go-quick-start.md) or the [Rust quick start](../native/tutorials/rust-quick-start.md).

## New vaults API: `defineVaultGroup` and `createVaultClient`

{% hint style="warning" %}
**Breaking change.** The vaults API of 3.7 is removed and replaced. Code that imports from `@zama-fhe/sdk/vaults` or `@zama-fhe/react-sdk/vaults` must move to the new client.
{% endhint %}

You now describe each group of vaults once with `defineVaultGroup`, and create one client per SDK with `createVaultClient(sdk)` (`useVaultClient()` in React). The client holds no config: every method takes the group or the batch it acts on, so one client serves every chain and group. Vaults that take deposits in the same confidential asset form a group, and a single vault is a group of one.

- **Groups.** `defineVaultGroup({ id, chainId, asset, router?, vaults })` takes the vaults as an array in leg order, each with `id`, `batchers: { deposit, redeem }` and its `share` token. A group holds at most `MAX_GROUP_VAULTS` vaults: what one transaction's FHE compute fits.
- **Every join covers the whole group.** `deposit` and `redeem` send a leg to every vault of the group: the chosen vault gets the amount, the others an encrypted zero. This is what hides the chosen vault. They return `JoinOutcome`, with the batch each leg landed in as a `BatchRef` (`{ chainId, batcher, batchId }`).
- **Batch actions act on one batch.** `claim`, `quit`, `dispatch` and `finalize` take one batch each. A keeper normally dispatches, finalizes and claims for every depositor. To keep the choice private when taking a deposit back from a pending batch, quit every leg of the join.
- **Batch reads.** `readBatch(batchRef)` returns the batch's `state` (`pending`, `dispatched`, `finalized` or `canceled`), its timings, the account's encrypted deposit, the `actions` you can send now (`claim`, `quit`, `dispatch`, `finalize`), and `nextChangeAt`. `readOpenBatches(group, direction)` reads each vault's open batch for a form, and `activeBatchers(group, direction)` returns the batcher a join reaches on each vault.
- **Two ways to send.** The send methods (`deposit`, `redeem`, `claim`, `quit`, `dispatch`, `finalize`) sign with the SDK's signer. The `prepare*` methods return plain calls (`{ to, data, value }`) for a host with its own transaction pipeline. `prepareDeposit` and `prepareRedeem` need no signer and return a `PreparedJoin` with the operator approvals the account lacks in `operatorApprovals`, the join calls in `joins`, and both in send order in `calls`. `route: "legs"` prepares one transfer per vault instead of one router call, for a wallet that lands calls atomically. `checks: ["balance"]` checks the balance before preparing; the send methods check it by default, and `skipChecks` skips it.
- **Wallet prompts.** A first redemption from a group of N vaults sent one call at a time can take up to N + 1 wallet prompts: one operator approval of the router per share token the account has not approved it on yet, then the join. An operator approval lasts a year.
- **Batcher upgrades.** A vault's batcher can be a `BatcherHistory`, so joins move to a new batcher once the last configured batch of the old one is dispatched. Batches on the old batcher can still be read, claimed and quit.
- **React hooks:** `useVaultClient`, `useBatch`, `useOpenBatches`, `useDeposit`, `useRedeem`, `useClaim`, `useQuit`, `useDispatch` and `useFinalize`. `useBatch` refetches when `nextChangeAt` passes and polls while the batch waits for a dispatch or a settlement.
- **TanStack Query:** `vaultQueryKeys` (`all`, `batch`, `openBatches`), `batchQueryOptions`, `openBatchesQueryOptions`, `depositMutationOptions`, `redeemMutationOptions`, `claimMutationOptions`, `quitMutationOptions`, `dispatchMutationOptions`, `finalizeMutationOptions`, and `invalidateAfterVaultAction(queryClient)` for a host that sends prepared calls itself.
- **Errors:** `VaultBatcherPausedError` when a batcher of the group is paused, `UnlistedConfidentialTokenError` when the router's registry does not list a multi-vault deposit's asset, `VaultBatchNotDispatchedError` (whose `state` is now the string state) when a batch to finalize is not dispatched, and `VaultJoinUnconfirmedError` when a mined join's receipt does not confirm every leg.
- **Reads on another chain.** Reads go to the group's or batch's `chainId` whatever chain the wallet is on, which needs a provider that can read another chain, such as `WagmiProvider`. A send while the wallet is on another chain throws `ChainMismatchError`, whose new `targetChainId` is the group's or batch's chain. `ReadContractConfig` and `GenericProvider.getBlockTimestamp` gain an optional `chainId`: a custom `GenericProvider` must read that chain or throw.
- **Router presets.** Chain presets gain `vaultRouterAddress`. A group's `router` defaults to it and must match it when the preset sets one.

**Removed** from `@zama-fhe/sdk/vaults`, with what replaces them:

| Removed                                                                                                                                                                                    | Use instead                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vault`, `createVault`, `VaultBatcher`, `createVaultBatcher`, the `VaultGroup` class, `createVaultGroup`, `VaultAddresses`, `VaultMemberConfig`                                            | `defineVaultGroup` (which returns the new `VaultGroup` data type), `createVaultClient`, `VaultClient`                                                                             |
| `Vault.deposit`, `Vault.redeem`, `VaultBatcher.join`, `VaultGroup.deposit`, `VaultGroup.redeem` and their `prepare*` methods                                                               | `client.deposit`, `client.redeem`, `client.prepareDeposit`, `client.prepareRedeem`, each taking the group                                                                         |
| `VaultBatcher.claim`, `quit`, `recover`                                                                                                                                                    | `client.claim`, `client.quit` and their `prepare*` methods, each taking one batch. `quit` also takes a deposit back from a canceled batch.                                        |
| `VaultBatcher.dispatchBatch`, `finalize`, `prepareFinalize`                                                                                                                                | `client.dispatch`, `client.finalize` and their `prepare*` methods, each taking one batch                                                                                          |
| `batchState`, `batchStatus`, `currentBatchId`, `paused`, `timeUntilDispatchable`, `timeUntilCallbackDeadline`, `depositOf`, the numeric `BatchState` enum, `BatchStatus`                   | `client.readBatch`, `client.readOpenBatches`, `client.activeBatchers`, the string union `BatchState`                                                                              |
| `decodeJoined`, `findJoined`, `openBatchIds`, `VaultTopics`, `JoinedEvent`, `decodeVaultGroupJoins`                                                                                        | No replacement. `deposit` and `redeem` return the batch each leg landed in. A host that sends its own calls gets batch ids from its own indexer.                                  |
| The `*Contract` call builders (`joinContract`, `claimContract`, `routerJoinContract`, `encodeAllocationData`, …)                                                                           | No replacement. Use the `prepare*` methods, which return the calls.                                                                                                               |
| The per-batcher query options, `invalidateBatchQueries` and the `invalidateAfter*` helpers                                                                                                 | `batchQueryOptions`, `openBatchesQueryOptions`, the new mutation options, `invalidateAfterVaultAction`                                                                            |
| `VaultGroupJoinUnconfirmedError`                                                                                                                                                           | `VaultJoinUnconfirmedError`                                                                                                                                                       |
| From earlier beta builds: `defineVaults`, `VaultsConfig`, `JoinRecord`, `readPosition`, `exit`, `prepareExit`, `positionQueryOptions`, `exitMutationOptions`, `VaultActionNotAllowedError` | `defineVaultGroup`, `JoinOutcome.batches`, `readBatch`, `claim` and `quit`, `batchQueryOptions`, `claimMutationOptions` and `quitMutationOptions`, `VaultBatchNotDispatchedError` |

**Removed** from `@zama-fhe/react-sdk/vaults`: `useVault`, `useVaultBatcher`, `useVaultGroup`, `useJoin`, `useRecover`, `useDispatchBatch`, `useGroupDeposit`, `useGroupRedeem`, `useBatchState`, `useBatchStatus`, `useCurrentBatchId`, `usePaused`, `useBatcherTokens`, `useTimeUntilDispatchable` and `useTimeUntilCallbackDeadline`, and, from earlier beta builds, `usePosition` and `useExit`. `useDeposit`, `useRedeem`, `useClaim`, `useQuit` and `useFinalize` keep their names but take new variables: the group with the join for `useDeposit` and `useRedeem`, and a `BatchRef` for the others. Use `useBatch` and `useOpenBatches` for reads.

The root entry now exports `confidentialTransferAndCallContract`, `confidentialTransferFromAndCallContract` and `unwrapAmountContract`.

See [Vaults overview](../guides/vaults/README.md) and [`VaultClient`](../reference/sdk/VaultClient.md).

## Typed errors for the protocol's FHE compute limits

The protocol caps the FHE compute, measured in HCU, that a transaction and a block can use. A write whose gas estimation hits one of them now throws a typed error instead of a bare `TransactionRevertedError`, from `submitTransaction`-backed methods and from `sdk.offline.prepare` alike: `HcuBlockLimitExceededError` (`HCU_BLOCK_LIMIT_EXCEEDED`) when the block has too little left, which is retryable in the next block, and `HcuTransactionLimitExceededError` (`HCU_TRANSACTION_LIMIT_EXCEEDED`) when the transaction needs more HCU, in total or in one sequential chain, than one transaction may use, which a retry cannot fix.

A transaction that is mined and then reverts now throws `TransactionRevertedError` instead of returning a result. `TransactionReceipt` gained an optional `status` (`"success"` or `"reverted"`); the viem, ethers and wagmi providers fill it.

See [Errors](../reference/sdk/errors.md#hcublocklimitexceedederror).

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

## `ApiKeyCookie` relayer auth removed

`ApiKeyCookie` is removed from relayer authentication, so `FheChain.auth` is now `ApiKeyHeader | BearerToken`. The Zama-hosted relayer only accepts the `x-api-key` header, and in a browser the cookie never reached a server: it was written with `document.cookie` and marked `HttpOnly`, which browsers ignore when a script sets it. It was only ever sent, as a real `Cookie` header, from Node.js, which includes the daemon behind the Go and Rust clients. A setup that authenticated to its own proxy that way needs to change.

- **TypeScript:** remove `{ __type: "ApiKeyCookie" }` from `FheChain.auth`. It no longer type-checks, and a config that still carries it (from untyped code, say) throws `ConfigurationError` with `Unknown auth type: ApiKeyCookie` when the SDK builds the relayer, rather than going out without credentials.
- **Go and Rust clients:** `zama.APIKeyCookie` and `RelayerAuth::ApiKeyCookie` are removed, so code that uses them no longer compiles.
- **Daemon protocol:** `api_key_cookie` is removed from `ChainAuth` and its field number (3) is reserved. A client that still sends it is rejected with `FAILED_PRECONDITION`; run the client and the daemon at exactly the same version.
- **Migrate:** have your proxy read its credential from a header and use `ApiKeyHeader` with the optional `header` name (the default is `x-api-key`). See [Auth methods reference](../guides/authentication.md#5-auth-methods-reference).
