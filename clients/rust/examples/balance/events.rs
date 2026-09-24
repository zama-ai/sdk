use anyhow::Result;
use zama_sdk_sidecar::{
    CallbackChannel, EventContext, EventEnum, EventHandler, Notification, ProgressKind, Sdk,
    async_trait,
};

pub struct Diagnostics;

#[async_trait]
impl EventHandler for Diagnostics {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> Result<()> {
        match notification {
            Notification::Lifecycle(event) => {
                eprintln!("SDK event {} (sequence {})", event.kind, context.sequence)
            }
            Notification::WalletAccountChanged { .. } => eprintln!("SDK wallet account changed"),
            Notification::Progress(progress) => {
                let stage = match progress.kind {
                    EventEnum::Known(ProgressKind::EncryptComplete) => "encrypted",
                    EventEnum::Known(ProgressKind::TransferSubmitted) => "transfer submitted",
                    EventEnum::Known(ProgressKind::ApprovalSubmitted) => "approval submitted",
                    EventEnum::Known(ProgressKind::ShieldSubmitted) => "shield submitted",
                    EventEnum::Known(ProgressKind::WrapSubmitted) => "wrap submitted",
                    EventEnum::Known(ProgressKind::UnwrapSubmitted) => "unwrap submitted",
                    EventEnum::Known(ProgressKind::Finalizing) => "finalizing",
                    EventEnum::Known(ProgressKind::FinalizeSubmitted) => "finalize submitted",
                    EventEnum::Known(_) | EventEnum::Unknown(_) => "unknown",
                };
                eprintln!("SDK progress: {stage} ({})", progress.kind);
            }
            _ => eprintln!("SDK notification received"),
        }
        Ok(())
    }
}

pub fn observe_channel(sdk: Sdk) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let _ = sdk.wait_channel_closed(CallbackChannel::Events).await;
        eprintln!("SDK event channel closed; notifications may be incomplete");
    })
}
