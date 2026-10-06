---
description: Find the Go client's API reference and the Go method for each TypeScript SDK operation.
---

# Go client API

The package reference on [pkg.go.dev](https://pkg.go.dev/github.com/zama-ai/sdk/clients/go/v3) lists every exported type, function, and method with its signature.

`Dial` creates a `Client`; `Client.CreateContext` creates an `SDKContext`. Configuration uses `SDKConfig`, `ChainConfig`, and `SignerConfig`. `SDKContext.Close` releases the context, and `Client.Close` closes the connection.

## Operations

Each daemon operation runs the matching TypeScript SDK method. Every Go method takes a `context.Context` first.

| TypeScript SDK                                                                                              | Go                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `new ZamaSDK(config)`                                                                                       | `Client.CreateContext`                   |
| [`sdk.terminate`](../../reference/sdk/ZamaSDK.md#terminate)                                                 | `SDKContext.Close`                       |
| Signer [`walletAccount`](../../reference/sdk/GenericSigner.md#walletaccount) change                         | `SDKContext.UpdateAccount`               |
| `sdk.encrypt`                                                                                               | `SDKContext.Encrypt`                     |
| [`sdk.decryption.decryptValues`](../../reference/sdk/ZamaSDK.md#decryption-decryptvalues)                   | `SDKContext.DecryptValues`               |
| `sdk.decryption.decryptPublicValues`                                                                        | `SDKContext.DecryptPublicValues`         |
| `sdk.decryption.delegatedDecryptValues`                                                                     | `SDKContext.DelegatedDecryptValues`      |
| `sdk.decryption.delegatedBatchDecryptValues`                                                                | `SDKContext.DelegatedBatchDecryptValues` |
| [`sdk.permits.grantPermit`](../../reference/sdk/ZamaSDK.md#permits-grantpermit)                             | `SDKContext.GrantPermit`                 |
| [`sdk.permits.hasPermit`](../../reference/sdk/ZamaSDK.md#permits-haspermit)                                 | `SDKContext.HasPermit`                   |
| [`sdk.permits.grantDelegationPermit`](../../reference/sdk/ZamaSDK.md#permits-grantdelegationpermit)         | `SDKContext.GrantDelegationPermit`       |
| [`sdk.permits.hasDelegationPermit`](../../reference/sdk/ZamaSDK.md#permits-hasdelegationpermit)             | `SDKContext.HasDelegationPermit`         |
| [`sdk.permits.registerPermit`](../../reference/sdk/ZamaSDK.md#permits-registerpermit)                       | `SDKContext.RegisterPermit`              |
| [`sdk.permits.revokePermits`](../../reference/sdk/ZamaSDK.md#permits-revokepermits)                         | `SDKContext.RevokePermits`               |
| [`sdk.permits.clear`](../../reference/sdk/ZamaSDK.md#permits-clear)                                         | `SDKContext.ClearPermits`                |
| [`sdk.permits.warmTransportKeyPair`](../../reference/sdk/ZamaSDK.md#permits-warmtransportkeypair)           | `SDKContext.WarmTransportKeyPair`        |
| [`sdk.permits.warmTransportKeyPairScope`](../../reference/sdk/ZamaSDK.md#permits-warmtransportkeypairscope) | `SDKContext.WarmTransportKeyPairScope`   |
| [`sdk.permits.revokeTransportKeyPair`](../../reference/sdk/ZamaSDK.md#permits-revoketransportkeypair)       | `SDKContext.RevokeTransportKeyPair`      |
| [`sdk.offline.prepare`](../../reference/sdk/Offline.md#prepare)                                             | `SDKContext.PrepareTransaction`          |
| [`sdk.offline.preparePermit`](../../reference/sdk/Offline.md#preparepermit)                                 | `SDKContext.PreparePermit`               |
| [`sdk.delegations.delegateDecryption`](../../reference/sdk/delegation.md#delegatedecryption)                | `SDKContext.DelegateDecryption`          |
| [`sdk.delegations.revokeDelegation`](../../reference/sdk/delegation.md#revokedelegation)                    | `SDKContext.RevokeDelegation`            |
| [`sdk.delegations.isActive`](../../reference/sdk/delegation.md#isactive)                                    | `SDKContext.IsDelegationActive`          |
| [`sdk.delegations.getExpiry`](../../reference/sdk/delegation.md#getexpiry)                                  | `SDKContext.GetDelegationExpiry`         |
| [`sdk.delegations.getStatus`](../../reference/sdk/delegation.md#getstatus)                                  | `SDKContext.GetDelegationStatus`         |

`RevokePermits(ctx, nil)` revokes every permit for the current signer; an empty slice revokes nothing. `Client.Info` returns the daemon's bundled SDK version.

`batchPreparePermits`, `batchRegisterPermits`, and the `Token` and `WrappedToken` APIs have no Go equivalent yet.

## Callback channels

These methods have no TypeScript equivalent. They connect your application's wallet, storage, and event handlers to the daemon:

- `SDKContext.AttachWallet` and `SDKContext.AttachSigner` attach or reattach the signer.
- `SDKContext.AttachStorage` reattaches application-owned storage.
- `SDKContext.SubscribeEvents` and `SDKContext.StopEvents` manage the event subscription.
- `SDKContext.WaitChannelFailure` reports when a channel closes.

See [Recover from disconnections](../guides/recover-from-disconnections.md) for how to use them.
