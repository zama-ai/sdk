---
description: Detect closed callback channels and restore Go and Rust SDK contexts.
---

# Recover from disconnections

An SDK context uses callback channels for your wallet, your application-owned storage, and events. If one closes, operations that need it fail until you restore it. The clients never retry an interrupted operation or wallet action for you.

## Supervise callback channels

Run a supervisor next to each SDK context. Stop it during normal shutdown so that an intentional close does not trigger recovery.

{% tabs %}
{% tab title="Go" %}

Supervise each channel you attached and reattach only that channel with `AttachWallet`, `AttachStorage`, or `SubscribeEvents`.

```go
// Watch only the channels you attached: waiting on any other returns an error at once.
reattach := map[zama.ChannelKind]func(context.Context) error{
	zama.SignerChannel:  func(ctx context.Context) error { return sdk.AttachWallet(ctx, signer) },
	zama.StorageChannel: sdk.AttachStorage,
	zama.EventChannel: func(ctx context.Context) error {
		_, err := sdk.SubscribeEvents(ctx, handlers)
		return err
	},
}
for kind, attach := range reattach {
	go func() {
		for {
			err := sdk.WaitChannelFailure(ctx, kind)
			if ctx.Err() != nil {
				return // normal shutdown
			}
			log.Printf("%s channel closed: %v", kind, err)
			if err := attach(ctx); err != nil {
				log.Printf("reattach %s channel: %v", kind, err) // the daemon restarted: create a new context
				return
			}
		}
	}()
}
```

{% endtab %}
{% tab title="Rust" %}

The Rust client does not reattach channels. Close the SDK context and build a replacement with the same configuration, signer, event handler, and storage binding. This example also needs Tokio's `sync` feature.

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use zama_sdk::{
    ApplicationStorage, CallbackChannel, CancellationToken, Client, EventHandler, Sdk, SdkConfig,
    Signer, WalletAccount,
};

// Rebuild with the same configuration, signer, event handler, and storage binding.
async fn build_sdk<H: EventHandler + Clone + 'static>(
    client: &Client,
    config: SdkConfig,
    account: WalletAccount,
    signer: Arc<dyn Signer>,
    events: H,
    storage: ApplicationStorage,
) -> zama_sdk::Result<Sdk> {
    client
        .sdk(config)
        .signer(Some(account), signer)
        .events(events)
        .storage(storage)
        .build()
        .await
}

pub async fn supervise<H: EventHandler + Clone + 'static>(
    client: Client,
    config: SdkConfig,
    account: WalletAccount,
    signer: Arc<dyn Signer>,
    events: H,
    storage: ApplicationStorage,
    current: Arc<RwLock<Sdk>>,
    shutdown: CancellationToken,
) {
    tokio::spawn(async move {
        loop {
            let sdk = current.read().await.clone();
            // Watch only the channels you attach: waiting on any other returns an error at once.
            let (channel, closed) = tokio::select! {
                _ = shutdown.cancelled() => return,
                closed = sdk.wait_channel_closed(CallbackChannel::Signer) => ("signer", closed),
                closed = sdk.wait_channel_closed(CallbackChannel::Storage) => ("storage", closed),
                closed = sdk.wait_channel_closed(CallbackChannel::Events) => ("events", closed),
            };
            eprintln!("{channel} channel closed: {closed:?}");
            let _ = sdk.close().await;
            let replacement = build_sdk(
                &client,
                config.clone(),
                account,
                signer.clone(),
                events.clone(),
                storage.clone(),
            )
            .await;
            match replacement {
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
