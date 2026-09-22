use crate::{Address, B256, ClearValues, SdkError, WalletAccount, async_trait, generated};
use anyhow::{Result, ensure};
use std::fmt;

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
macro_rules! native_event_enum {
    ($name:ident { $($variant:ident),+ $(,)? }) => {
        #[non_exhaustive]
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum $name { $($variant),+ }

        impl TryFrom<i32> for $name {
            type Error = ();
            fn try_from(raw: i32) -> std::result::Result<Self, Self::Error> {
                match generated::$name::try_from(raw).map_err(|_| ())? {
                    $(generated::$name::$variant => Ok(Self::$variant)),+
                }
            }
        }

        impl fmt::Display for EventEnum<$name> {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self {
                    $(Self::Known($name::$variant) => formatter.write_str(generated::$name::$variant.as_str_name()),)+
                    Self::Unknown(raw) => write!(formatter, "Unknown({raw})"),
                }
            }
        }
    };
}
native_event_enum!(SdkEventKind {
    Unspecified,
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
});
native_event_enum!(EventOperation {
    Unspecified,
    GrantPermit,
    GrantDelegationPermit,
    RegisterPermit,
    ApproveUnderlying,
    ApproveUnderlyingReset,
    DelegateDecryption,
    FinalizeUnwrap,
    RevokeDelegation,
    SetOperator,
    ShieldTransferAndCall,
    ShieldApproveAndWrap,
    Wrap,
    Transfer,
    TransferAndCall,
    TransferFrom,
    TransferFromAndCall,
    Unwrap,
    UnwrapAll,
});
native_event_enum!(ShieldPath {
    Unspecified,
    TransferAndCall,
    ApproveAndWrap
});
native_event_enum!(ApprovalStep {
    Unspecified,
    Reset,
    Approve
});
native_event_enum!(ProgressKind {
    Unspecified,
    EncryptComplete,
    TransferSubmitted,
    ApprovalSubmitted,
    ShieldSubmitted,
    WrapSubmitted,
    UnwrapSubmitted,
    Finalizing,
    FinalizeSubmitted,
});
pub type EventKind = EventEnum<SdkEventKind>;

/// May contain decrypted plaintext; select metadata explicitly when writing diagnostics.
#[derive(Clone, Debug, PartialEq)]
pub struct SdkEvent {
    pub kind: EventKind,
    pub timestamp: f64,
    pub token_address: Option<Address>,
    /// ID assigned by the SDK; it can differ from the RPC operation ID.
    pub sdk_operation_id: Option<String>,
    pub duration_ms: Option<f64>,
    pub encrypted_values: Vec<B256>,
    pub result: ClearValues,
    pub error: Option<SdkError>,
    pub operation: Option<EventEnum<EventOperation>>,
    pub tx_hash: Option<B256>,
    pub shield_path: Option<EventEnum<ShieldPath>>,
    pub step: Option<EventEnum<ApprovalStep>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EventContext {
    pub context_id: String,
    /// Absent for SDK activity outside a unary RPC.
    pub operation_id: Option<String>,
    pub sequence: u64,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperationProgress {
    pub kind: EventEnum<ProgressKind>,
    pub tx_hash: Option<B256>,
}
#[non_exhaustive]
#[derive(Clone, Debug, PartialEq)]
pub enum Notification {
    Lifecycle(Box<SdkEvent>),
    WalletAccountChanged {
        previous: Option<WalletAccount>,
        next: Option<WalletAccount>,
    },
    Progress(OperationProgress),
}
/// Notifications run sequentially. Errors are reported to the sidecar; a panic closes the subscription.
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
        Ok(Self {
            kind: EventEnum::from_raw(progress.kind),
            tx_hash: progress
                .tx_hash
                .as_deref()
                .map(crate::types::handle)
                .transpose()?,
        })
    }
}
