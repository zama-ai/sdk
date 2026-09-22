use crate::{Address, B256, ClearValues, SdkError, WalletAccount, async_trait, generated};
use anyhow::{Context, Result, ensure};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventEnum<E> {
    Known(E),
    Unknown(i32),
}
impl<E: TryFrom<i32>> EventEnum<E> {
    pub fn from_raw(value: i32) -> Self {
        match E::try_from(value) {
            Ok(known) => Self::Known(known),
            Err(_) => Self::Unknown(value),
        }
    }
}
pub type EventKind = EventEnum<generated::SdkEventKind>;
impl EventEnum<generated::SdkEventKind> {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Known(kind) => kind.as_str_name(),
            Self::Unknown(_) => "SDK_EVENT_KIND_UNKNOWN",
        }
    }
}

/// May contain decrypted plaintext; select metadata explicitly when writing diagnostics.
#[derive(Clone, Debug, PartialEq)]
pub struct SdkEvent {
    pub kind: EventKind,
    pub timestamp: f64,
    pub token_address: Option<Address>,
    /// SDK multi-phase correlation, independent of the enclosing RPC operation ID.
    pub sdk_operation_id: Option<String>,
    pub duration_ms: Option<f64>,
    pub encrypted_values: Vec<B256>,
    pub result: ClearValues,
    pub error: Option<SdkError>,
    pub operation: Option<EventEnum<generated::EventOperation>>,
    pub tx_hash: Option<B256>,
    pub shield_path: Option<EventEnum<generated::ShieldPath>>,
    pub step: Option<EventEnum<generated::ApprovalStep>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EventContext {
    pub context_id: String,
    /// Absent for SDK activity outside a unary RPC.
    pub operation_id: Option<String>,
    pub sequence: u64,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OperationProgress {
    EncryptComplete,
    TransferSubmitted(B256),
    ApprovalSubmitted(B256),
    ShieldSubmitted(B256),
    WrapSubmitted(B256),
    UnwrapSubmitted(B256),
    Finalizing,
    FinalizeSubmitted(B256),
}
#[derive(Clone, Debug, PartialEq)]
pub enum Notification {
    Lifecycle(Box<SdkEvent>),
    WalletAccountChanged {
        previous: Option<WalletAccount>,
        next: Option<WalletAccount>,
    },
    Progress(OperationProgress),
}
/// Notifications run sequentially. Returned errors are reported without failing SDK operations.
#[async_trait]
pub trait EventHandler: Send + Sync {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> Result<()>;
}

pub(crate) fn address(bytes: &[u8]) -> Result<Address> {
    ensure!(bytes.len() == 20, "invalid event token address");
    Ok(Address::from_slice(bytes))
}
impl TryFrom<generated::SdkEvent> for SdkEvent {
    type Error = anyhow::Error;
    fn try_from(event: generated::SdkEvent) -> Result<Self> {
        Ok(Self {
            kind: EventKind::from_raw(event.r#type),
            timestamp: event.timestamp,
            token_address: event.token_address.as_deref().map(address).transpose()?,
            sdk_operation_id: event.sdk_operation_id,
            duration_ms: event.duration_ms,
            encrypted_values: event
                .encrypted_values
                .iter()
                .map(|v| crate::types::handle(v))
                .collect::<Result<_>>()?,
            result: crate::types::clear_values(event.result)?,
            error: event.error.map(Into::into),
            operation: event.operation.map(EventEnum::from_raw),
            tx_hash: event
                .tx_hash
                .as_deref()
                .map(crate::types::handle)
                .transpose()?,
            shield_path: event.shield_path.map(EventEnum::from_raw),
            step: event.step.map(EventEnum::from_raw),
        })
    }
}
impl TryFrom<generated::OperationProgress> for OperationProgress {
    type Error = anyhow::Error;
    fn try_from(progress: generated::OperationProgress) -> Result<Self> {
        use generated::ProgressKind;
        let hash = || {
            crate::types::handle(
                progress
                    .tx_hash
                    .as_deref()
                    .context("missing progress transaction hash")?,
            )
        };
        Ok(match ProgressKind::try_from(progress.kind)? {
            ProgressKind::EncryptComplete => Self::EncryptComplete,
            ProgressKind::TransferSubmitted => Self::TransferSubmitted(hash()?),
            ProgressKind::ApprovalSubmitted => Self::ApprovalSubmitted(hash()?),
            ProgressKind::ShieldSubmitted => Self::ShieldSubmitted(hash()?),
            ProgressKind::WrapSubmitted => Self::WrapSubmitted(hash()?),
            ProgressKind::UnwrapSubmitted => Self::UnwrapSubmitted(hash()?),
            ProgressKind::Finalizing => Self::Finalizing,
            ProgressKind::FinalizeSubmitted => Self::FinalizeSubmitted(hash()?),
            ProgressKind::Unspecified => anyhow::bail!("unspecified progress kind"),
        })
    }
}
