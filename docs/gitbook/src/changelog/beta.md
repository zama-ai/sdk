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

Start with the [Go quick start](../native/tutorials/go-quick-start.md) or the [Rust quick start](../native/tutorials/rust-quick-start.md).

## Permit signing with browser extensions that patch `BigInt`

`ViemSigner` and `WagmiSigner` now convert the typed-data domain `chainId` to a number and every `bigint` value in the message to a decimal string before calling viem. Browser extensions that patch how `bigint` is JSON-serialized made viem send the permit's `chainId` as `"1n"`, and the wallet rejected the signature with `chainId should be same as current chainId`; with no `bigint` left in the request, such a patch has nothing to act on. Signatures are unchanged, and `EthersSigner` was never affected.

## InGen testnet removed

The SDK no longer supports the T-Rex InGen testnet (chain ID `364301`). The `ingenTestnet` preset is removed from `@zama-fhe/sdk/chains`, from the built-in `chains` map and from the deprecated `DefaultRegistryAddresses`, and the `example-ingen` app is removed. Use `zenithTrexTestnet`, `hoodi` or `bscTestnet` for a cleartext testnet.
