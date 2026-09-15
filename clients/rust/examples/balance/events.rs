use anyhow::Result;
use zama_sdk_sidecar::{EventContext, EventHandler, Notification, async_trait};

pub struct Diagnostics;

#[async_trait]
impl EventHandler for Diagnostics {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> Result<()> {
        match notification {
            Notification::Lifecycle(event) => eprintln!(
                "SDK event {} (sequence {})",
                event.kind.as_str(),
                context.sequence
            ),
            Notification::WalletAccountChanged { .. } => eprintln!("SDK wallet account changed"),
            Notification::Progress(progress) => {
                let stage = match progress {
                    zama_sdk_sidecar::OperationProgress::EncryptComplete => "encrypted",
                    zama_sdk_sidecar::OperationProgress::TransferSubmitted(_) => {
                        "transfer submitted"
                    }
                    zama_sdk_sidecar::OperationProgress::ApprovalSubmitted(_) => {
                        "approval submitted"
                    }
                    zama_sdk_sidecar::OperationProgress::ShieldSubmitted(_) => "shield submitted",
                    zama_sdk_sidecar::OperationProgress::WrapSubmitted(_) => "wrap submitted",
                    zama_sdk_sidecar::OperationProgress::UnwrapSubmitted(_) => "unwrap submitted",
                    zama_sdk_sidecar::OperationProgress::Finalizing => "finalizing",
                    zama_sdk_sidecar::OperationProgress::FinalizeSubmitted(_) => {
                        "finalize submitted"
                    }
                };
                eprintln!("SDK progress: {stage}");
            }
        }
        Ok(())
    }
}
