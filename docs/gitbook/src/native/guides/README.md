---
description: Integrate your Go or Rust application with the Zama SDK daemon — wallet, credentials, events, and connection lifecycle.
---

# Clients

Integrate your Go or Rust application with the local daemon: connect a wallet, store credentials, observe SDK activity, and handle disconnections and uncertain transaction outcomes.

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

## Where to go next

🟨 Go to [**Attach a wallet**](attach-wallet.md) for signatures and transaction submission.

🟨 Go to [**Store credentials**](credential-storage.md) in your own database.

🟨 Go to [**Observe events**](observe-events.md) for SDK activity.

🟨 Go to [**Recover from disconnections**](recover-from-disconnections.md) of the signer, storage, or event channel.

🟨 Go to [**Resolve uncertain transaction outcomes**](uncertain-transaction-outcomes.md) before retrying a write.

The shared SDK guides — such as [Encrypt & decrypt](../../guides/encrypt-decrypt.md), [Delegated decryption](../../guides/delegated-decryption.md), and [Offline signing](../../guides/offline.md) — include Go and Rust tabs for supported operations.
