---
description: Integrate Go and Rust applications with the Zama SDK daemon and manage wallets, credentials, and connection lifecycles.
---

# Go & Rust clients

Use these guides to integrate your Go or Rust application with the local daemon, your wallet, and your credential storage.

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

Start with the [Go quick start](tutorials/go-quick-start.md) or [Rust quick start](tutorials/rust-quick-start.md). Then [configure the SDK](../guides/configuration.md): its Go and Rust tabs cover connecting to the daemon, chains, relayers, and storage.

## Integrate with your application

- [Attach a wallet](guides/attach-wallet.md) for signatures and transaction submission.
- [Store credentials](guides/credential-storage.md) in your own database.
- [Observe events](guides/observe-events.md) for SDK activity.
- [Recover from disconnections](guides/recover-from-disconnections.md) of the signer, storage, or event channel.
- [Resolve uncertain transaction outcomes](guides/uncertain-transaction-outcomes.md) before retrying a write.

The shared SDK guides, such as [Encrypt & decrypt](../guides/encrypt-decrypt.md), [Delegated decryption](../guides/delegated-decryption.md), and [Offline signing](../guides/offline.md), include Go and Rust tabs for supported operations.

## Deploy the daemon

The daemon is a required part of a Go or Rust integration. Read [Deploy in production](operations/run-in-production.md) before running it on your infrastructure, and check [client and daemon compatibility](reference/client-and-daemon-compatibility.md) when upgrading.
