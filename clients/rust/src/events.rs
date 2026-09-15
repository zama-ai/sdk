use crate::{Address, B256, BigInt, ClearValues, SdkError, WalletAccount, async_trait, generated};
use anyhow::{Context, Result, ensure};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
    EncryptStart,
    EncryptEnd,
    EncryptError,
    DecryptStart,
    DecryptEnd,
    DecryptError,
    PermitError,
    TransactionError,
    ShieldSubmitted,
    TransferSubmitted,
    TransferFromSubmitted,
    SetOperatorSubmitted,
    ApproveUnderlyingSubmitted,
    WrapSubmitted,
    UnwrapSubmitted,
    FinalizeUnwrapSubmitted,
    DelegationSubmitted,
    RevokeDelegationSubmitted,
    UnshieldPhase1Submitted,
    UnshieldPhase2Started,
    UnshieldPhase2Submitted,
}
impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EncryptStart => "encrypt:start",
            Self::EncryptEnd => "encrypt:end",
            Self::EncryptError => "encrypt:error",
            Self::DecryptStart => "decrypt:start",
            Self::DecryptEnd => "decrypt:end",
            Self::DecryptError => "decrypt:error",
            Self::PermitError => "permit:error",
            Self::TransactionError => "transaction:error",
            Self::ShieldSubmitted => "shield:submitted",
            Self::TransferSubmitted => "transfer:submitted",
            Self::TransferFromSubmitted => "transferFrom:submitted",
            Self::SetOperatorSubmitted => "setOperator:submitted",
            Self::ApproveUnderlyingSubmitted => "approveUnderlying:submitted",
            Self::WrapSubmitted => "wrap:submitted",
            Self::UnwrapSubmitted => "unwrap:submitted",
            Self::FinalizeUnwrapSubmitted => "finalizeUnwrap:submitted",
            Self::DelegationSubmitted => "delegation:submitted",
            Self::RevokeDelegationSubmitted => "revokeDelegation:submitted",
            Self::UnshieldPhase1Submitted => "unshield:phase1_submitted",
            Self::UnshieldPhase2Started => "unshield:phase2_started",
            Self::UnshieldPhase2Submitted => "unshield:phase2_submitted",
        }
    }
}
impl TryFrom<&str> for EventKind {
    type Error = anyhow::Error;
    fn try_from(value: &str) -> Result<Self> {
        Ok(match value {
            "encrypt:start" => Self::EncryptStart,
            "encrypt:end" => Self::EncryptEnd,
            "encrypt:error" => Self::EncryptError,
            "decrypt:start" => Self::DecryptStart,
            "decrypt:end" => Self::DecryptEnd,
            "decrypt:error" => Self::DecryptError,
            "permit:error" => Self::PermitError,
            "transaction:error" => Self::TransactionError,
            "shield:submitted" => Self::ShieldSubmitted,
            "transfer:submitted" => Self::TransferSubmitted,
            "transferFrom:submitted" => Self::TransferFromSubmitted,
            "setOperator:submitted" => Self::SetOperatorSubmitted,
            "approveUnderlying:submitted" => Self::ApproveUnderlyingSubmitted,
            "wrap:submitted" => Self::WrapSubmitted,
            "unwrap:submitted" => Self::UnwrapSubmitted,
            "finalizeUnwrap:submitted" => Self::FinalizeUnwrapSubmitted,
            "delegation:submitted" => Self::DelegationSubmitted,
            "revokeDelegation:submitted" => Self::RevokeDelegationSubmitted,
            "unshield:phase1_submitted" => Self::UnshieldPhase1Submitted,
            "unshield:phase2_started" => Self::UnshieldPhase2Started,
            "unshield:phase2_submitted" => Self::UnshieldPhase2Submitted,
            _ => anyhow::bail!("unknown SDK event kind"),
        })
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
    pub operation: Option<String>,
    pub tx_hash: Option<B256>,
    pub shield_path: Option<String>,
    pub step: Option<String>,
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
#[derive(Clone, Debug, PartialEq)]
pub struct BatchErrorCallback {
    pub token_address: Address,
    pub error: SdkError,
}

/// Notifications run sequentially. Returned errors are reported without failing SDK operations.
/// Batch callback futures are dropped on cancellation or channel loss; deliveries are never replayed.
#[async_trait]
pub trait EventHandler: Send + Sync {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> Result<()>;
    async fn on_batch_error(
        &self,
        _context: EventContext,
        callback: BatchErrorCallback,
    ) -> Result<BigInt> {
        Err(callback.error.into())
    }
}

pub(crate) fn address(bytes: &[u8]) -> Result<Address> {
    ensure!(bytes.len() == 20, "invalid event token address");
    Ok(Address::from_slice(bytes))
}
impl TryFrom<generated::SdkEvent> for SdkEvent {
    type Error = anyhow::Error;
    fn try_from(event: generated::SdkEvent) -> Result<Self> {
        Ok(Self {
            kind: event.r#type.as_str().try_into()?,
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
            operation: event.operation,
            tx_hash: event
                .tx_hash
                .as_deref()
                .map(crate::types::handle)
                .transpose()?,
            shield_path: event.shield_path,
            step: event.step,
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
