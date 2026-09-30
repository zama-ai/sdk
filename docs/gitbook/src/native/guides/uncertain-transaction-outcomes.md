---
description: Reconcile uncertain transaction outcomes observed by Go and Rust applications.
---

# Resolve uncertain transaction outcomes

Check your application's transaction records before repeating an SDK write that timed out, was cancelled, or lost its wallet connection.

{% hint style="warning" %}
Cancellation stops waiting; it cannot reverse a broadcast. A failed operation or a closed signer channel does not prove that no transaction was sent.
{% endhint %}

Record every transaction hash in your wallet's write path, together with the account, chain, nonce, and operation.

| Result                                                                                 | Next action                                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SIGNING_REJECTED`                                                                     | Request another wallet action only after user approval                       |
| `SIGNING_FAILED` or `CHAIN_MISMATCH` before broadcast                                  | Correct the wallet or provider configuration                                 |
| `TRANSACTION_REVERTED`                                                                 | Inspect the revert and fix its cause before submitting another write         |
| `TRANSACTION_OUTCOME_UNKNOWN`                                                          | Reconcile the recorded hash and account transactions before submitting again |
| Transport failure or cancellation after the wallet received the write                  | Treat the outcome as uncertain, whatever the error code                      |
| Cancellation, deadline, account change, or context close before the wallet received it | The operation fails with `CANCELLED`; nothing was sent                       |

`TRANSACTION_OUTCOME_UNKNOWN` also covers a closed signer channel, an invalid wallet reply, or a cancellation after the wallet received the write, even when no hash reached the daemon.

The SDK operation returns only an error code and message, not the hash. In Go, the built-in adapter exposes the hash as `BroadcastUncertainError.Hash` inside your wallet callback, so record it there.

Once a built-in adapter starts sending, cancellation does not interrupt the send. A process crash can still happen before you record the outcome. Check both pending and mined transactions for the account before issuing another write; the pending nonce alone cannot tell a lost send from an accepted one.

To restore a closed signer channel, see [Recover from disconnections](recover-from-disconnections.md). To sign outside the SDK operation entirely, use [Offline signing](../../guides/offline.md).
