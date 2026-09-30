---
description: Subscribe to lifecycle, wallet, and progress notifications in Go and Rust.
---

# Observe events

Subscribe to SDK events before starting operations on your SDK context. Log safe event metadata to correlate your application's requests with SDK activity.

## Attach an event subscriber

These subscribers log event kinds without printing results, decrypted values, or error payloads.

{% tabs %}
{% tab title="Go" %}

```go
subscription, err := sdk.SubscribeEvents(ctx, zama.EventHandlers{
	OnEvent: func(_ context.Context, correlation zama.EventCorrelation, event zama.SDKEvent) error {
		log.Printf("SDK event %s (operation %s)", event.Kind, correlation.OperationID)
		return nil
	},
	OnWalletAccountChanged: func(context.Context, zama.EventCorrelation, zama.WalletAccountChanged) error {
		log.Print("SDK wallet account changed")
		return nil
	},
	OnProgress: func(_ context.Context, _ zama.EventCorrelation, progress zama.OperationProgress) error {
		log.Printf("SDK progress %s", progress.Kind)
		return nil
	},
})
if err != nil {
	return err
}
defer subscription.Close()
```

To subscribe when the context is created, set `config.Events` before `CreateContext` instead. `correlation.OperationID` identifies the RPC operation; the event's `SDKOperationID` identifies the SDK's multi-step operation.

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{EventContext, EventHandler, Notification, async_trait};

pub struct Diagnostics;

#[async_trait]
impl EventHandler for Diagnostics {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> anyhow::Result<()> {
        match notification {
            Notification::Lifecycle(event) => {
                eprintln!("SDK event {} (sequence {})", event.kind, context.sequence);
            }
            Notification::WalletAccountChanged { .. } => eprintln!("SDK wallet account changed"),
            Notification::Progress(progress) => eprintln!("SDK progress {}", progress.kind),
            _ => {}
        }
        Ok(())
    }
}
```

Pass the handler to the builder with `client.sdk(config).events(Diagnostics).build().await?`. The subscription is active when `build()` returns. Handle unknown notification variants without failing.

{% endtab %}
{% endtabs %}

## Keep delivery responsive

Return promptly from event callbacks. If your log sink fails, return an error: the SDK operation continues. A Go callback panic is reported as `CALLBACK_FAILED`; a Rust callback panic ends the subscription.

The daemon holds at most 256 unacknowledged events per subscription, and a subscriber that falls further behind loses its event channel. Do not use events as a durable audit log or as the only record of a transaction outcome.

A replacement subscription receives future events only. Watch for a closed event channel as described in [Recover from disconnections](recover-from-disconnections.md).
