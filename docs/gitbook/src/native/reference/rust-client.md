---
description: Find the Rust client's API reference and the Rust method for each TypeScript SDK operation.
---

# Rust client API

The crate reference on [docs.rs](https://docs.rs/zama_sdk) lists every public type, function, and method with its signature, including the Alloy signing and transaction adapters behind the `alloy` feature.

`Client::connect` creates a `Client`; `Client::sdk` returns an `SdkBuilder`; `SdkBuilder::build` creates an `Sdk`. Configuration uses `SdkConfig` and `ChainConfig`, with signer and storage configuration on the builder. `Sdk::close` releases the SDK context and its callback channels.

## Operations

Each daemon operation runs the matching TypeScript SDK method. The `Sdk` exposes encryption and account updates directly, and groups the other operations behind `decryption()`, `permits()`, `offline()`, and `delegations()`.

| TypeScript SDK                                                                                              | Rust                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `new ZamaSDK(config)`                                                                                       | `client.sdk(config).build()`                      |
| [`sdk.terminate`](../../reference/sdk/ZamaSDK.md#terminate)                                                 | `sdk.close()`                                     |
| Signer [`walletAccount`](../../reference/sdk/GenericSigner.md#walletaccount) change                         | `sdk.update_account`                              |
| `sdk.encrypt`                                                                                               | `sdk.encrypt`                                     |
| [`sdk.decryption.decryptValues`](../../reference/sdk/ZamaSDK.md#decryption-decryptvalues)                   | `sdk.decryption().decrypt_values`                 |
| `sdk.decryption.decryptPublicValues`                                                                        | `sdk.decryption().decrypt_public_values`          |
| `sdk.decryption.delegatedDecryptValues`                                                                     | `sdk.decryption().delegated_decrypt_values`       |
| `sdk.decryption.delegatedBatchDecryptValues`                                                                | `sdk.decryption().delegated_batch_decrypt_values` |
| [`sdk.permits.grantPermit`](../../reference/sdk/ZamaSDK.md#permits-grantpermit)                             | `sdk.permits().grant_permit`                      |
| [`sdk.permits.hasPermit`](../../reference/sdk/ZamaSDK.md#permits-haspermit)                                 | `sdk.permits().has_permit`                        |
| [`sdk.permits.grantDelegationPermit`](../../reference/sdk/ZamaSDK.md#permits-grantdelegationpermit)         | `sdk.permits().grant_delegation_permit`           |
| [`sdk.permits.hasDelegationPermit`](../../reference/sdk/ZamaSDK.md#permits-hasdelegationpermit)             | `sdk.permits().has_delegation_permit`             |
| [`sdk.permits.registerPermit`](../../reference/sdk/ZamaSDK.md#permits-registerpermit)                       | `sdk.permits().register_permit`                   |
| [`sdk.permits.revokePermits`](../../reference/sdk/ZamaSDK.md#permits-revokepermits)                         | `sdk.permits().revoke_permits`                    |
| [`sdk.permits.clear`](../../reference/sdk/ZamaSDK.md#permits-clear)                                         | `sdk.permits().clear`                             |
| [`sdk.permits.warmTransportKeyPair`](../../reference/sdk/ZamaSDK.md#permits-warmtransportkeypair)           | `sdk.permits().warm_transport_key_pair`           |
| [`sdk.permits.warmTransportKeyPairScope`](../../reference/sdk/ZamaSDK.md#permits-warmtransportkeypairscope) | `sdk.permits().warm_transport_key_pair_scope`     |
| [`sdk.permits.revokeTransportKeyPair`](../../reference/sdk/ZamaSDK.md#permits-revoketransportkeypair)       | `sdk.permits().revoke_transport_key_pair`         |
| [`sdk.offline.prepare`](../../reference/sdk/Offline.md#prepare)                                             | `sdk.offline().prepare`                           |
| [`sdk.offline.preparePermit`](../../reference/sdk/Offline.md#preparepermit)                                 | `sdk.offline().prepare_permit`                    |
| [`sdk.delegations.delegateDecryption`](../../reference/sdk/delegation.md#delegatedecryption)                | `sdk.delegations().delegate_decryption`           |
| [`sdk.delegations.revokeDelegation`](../../reference/sdk/delegation.md#revokedelegation)                    | `sdk.delegations().revoke_delegation`             |
| [`sdk.delegations.isActive`](../../reference/sdk/delegation.md#isactive)                                    | `sdk.delegations().is_active`                     |
| [`sdk.delegations.getExpiry`](../../reference/sdk/delegation.md#getexpiry)                                  | `sdk.delegations().get_expiry`                    |
| [`sdk.delegations.getStatus`](../../reference/sdk/delegation.md#getstatus)                                  | `sdk.delegations().get_status`                    |

`revoke_permits(None)` revokes every permit for the current signer; an empty slice revokes nothing. `Client::sdk_version` returns the daemon's bundled SDK version.

`batchPreparePermits`, `batchRegisterPermits`, and the `Token` and `WrappedToken` APIs have no Rust equivalent yet.

## Callback channels

These have no TypeScript equivalent. They connect your application's wallet, storage, and event handlers to the daemon:

- `SdkBuilder::signer`, `SdkBuilder::storage`, and `SdkBuilder::events` attach them when you build the `Sdk`.
- `Sdk::wait_channel_closed` reports when a channel closes.

The Rust client does not reattach a closed channel. See [Recover from disconnections](../guides/recover-from-disconnections.md) for how to rebuild the SDK context.
