---
description: Detect closed callback channels and restore Go and Rust SDK contexts.
---

# Recover from disconnections

An SDK context uses callback channels for your wallet, your application-owned storage, and events. If one closes, operations that need it fail until you restore it. The clients never retry an interrupted operation or wallet action for you.

## Supervise callback channels

Run a supervisor next to each SDK context. Stop it during normal shutdown so that an intentional close does not trigger recovery.

{% tabs %}
{% tab title="Go" %}

Wait for the channel to close, then reattach it. `SignerChannel`, `StorageChannel`, and `EventChannel` select the channel; reattach them with `AttachWallet`, `AttachStorage`, or `SubscribeEvents`.

```go
go func() {
	for {
		err := sdk.WaitChannelFailure(ctx, zama.SignerChannel)
		if ctx.Err() != nil {
			return // normal shutdown
		}
		log.Printf("signer channel closed: %v", err)
		if err := sdk.AttachWallet(ctx, signer); err != nil {
			log.Printf("reattach wallet: %v", err) // the daemon restarted: create a new context
			return
		}
	}
}()
```

{% endtab %}
{% tab title="Rust" %}

The Rust client does not reattach channels. Close the SDK context and build a replacement with the same configuration, signer, event handler, and storage binding. This example also needs Tokio's `sync` feature.

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use zama_sdk::{ApplicationStorage, CallbackChannel, CancellationToken, Client, Sdk, SdkConfig};

// Rebuild with the same configuration, signer, event handler, and storage binding.
async fn build_sdk(
    client: &Client,
    config: SdkConfig,
    storage: ApplicationStorage,
) -> zama_sdk::Result<Sdk> {
    client.sdk(config).storage(storage).build().await
}

pub async fn supervise(
    client: Client,
    config: SdkConfig,
    storage: ApplicationStorage,
    current: Arc<RwLock<Sdk>>,
    shutdown: CancellationToken,
) {
    tokio::spawn(async move {
        loop {
            let sdk = current.read().await.clone();
            tokio::select! {
                _ = shutdown.cancelled() => return,
                closed = sdk.wait_channel_closed(CallbackChannel::Storage) => {
                    eprintln!("storage channel closed: {closed:?}");
                }
            }
            let _ = sdk.close().await;
            match build_sdk(&client, config.clone(), storage.clone()).await {
                Ok(replacement) => *current.write().await = replacement,
                Err(error) => {
                    eprintln!("rebuild SDK context: {error}");
                    return;
                }
            }
        }
    });
}
```

Clones of an `Sdk` share one SDK context, so closing any clone closes it for all of them.

{% endtab %}
{% endtabs %}

## Restore application work

1. Pause the work that needs the closed channel.
2. Reattach the channel, or create a new SDK context if the daemon restarted. SDK contexts do not survive a daemon restart.
3. Reuse the same storage binding and derivation secret, so existing credentials stay valid.
4. Resume the paused work.

If a write was in progress, follow [Resolve uncertain transaction outcomes](uncertain-transaction-outcomes.md) before submitting another one. Before requesting a new wallet signature, check whether the interrupted credential operation already completed.

A new event subscription receives future events only. Read missed state from the contract or your own records.

## Close SDK contexts

Close an SDK context when the workflow or session that owns it ends. In Go, call `sdk.Close` with a fresh, bounded context before closing the client and the Ethereum provider. In Rust, await `sdk.close()` before dropping your application's resources.

Do not clear stored credentials to fix a socket or callback failure. For daemon or storage volume incidents, follow [Upgrade and recover](../operations/upgrade-and-recover.md).
