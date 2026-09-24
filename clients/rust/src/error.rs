use std::{fmt, sync::Arc};

/// Errors returned by client operations.
#[derive(Clone, Debug)]
pub struct ClientError {
    kind: ErrorKind,
    message: String,
    // Boxed to keep `Result<T, ClientError>` under clippy's large-error threshold.
    sdk: Option<Box<SdkError>>,
    source: Option<Arc<dyn std::error::Error + Send + Sync + 'static>>,
}

/// Stable categories for failures at the client boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
#[non_exhaustive]
pub enum ErrorKind {
    /// The client or sidecar rejected configuration or arguments.
    InvalidInput,
    /// Connection or RPC failure with no more specific kind; a write may or may not have been submitted.
    Transport,
    /// A client or RPC deadline expired; write outcome may be unknown.
    Timeout,
    /// The RPC was cancelled before completing.
    Cancelled,
    /// A sidecar response or callback frame could not be decoded or validated.
    Protocol,
    /// A local callback channel closed before an expected message or reply.
    Closed,
    /// A callback channel failed to attach, or its worker task failed.
    Callback,
    /// The SDK context no longer exists on the sidecar; rebuild it before retrying.
    ContextLost,
    /// The SDK operation itself failed; details are in `sdk_error`.
    Sdk,
}

/// Result returned by client operations. Callback implementations may use their own error types.
pub type Result<T> = std::result::Result<T, ClientError>;

impl ClientError {
    /// Stable category for branching on the failure.
    #[must_use]
    pub fn kind(&self) -> ErrorKind {
        self.kind
    }

    /// Structured details reported by the SDK, when present.
    #[must_use]
    pub fn sdk_error(&self) -> Option<&SdkError> {
        self.sdk.as_deref()
    }

    /// Whether a write may have reached the network even though the call failed.
    pub fn is_outcome_unknown(&self) -> bool {
        match self.kind {
            ErrorKind::Timeout | ErrorKind::Transport => true,
            ErrorKind::Sdk => self
                .sdk
                .as_ref()
                .is_some_and(|sdk| sdk.code == "TRANSACTION_OUTCOME_UNKNOWN"),
            _ => false,
        }
    }

    pub(crate) fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            sdk: None,
            source: None,
        }
    }

    pub(crate) fn with_source(
        kind: ErrorKind,
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        Self {
            source: Some(Arc::new(source)),
            ..Self::new(kind, message)
        }
    }

    pub(crate) fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }

    pub(crate) fn protocol(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Protocol, message)
    }

    pub(crate) fn closed(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Closed, message)
    }

    pub(crate) fn timeout(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Timeout, message)
    }

    pub(crate) fn transport(
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        Self::with_source(ErrorKind::Transport, message, source)
    }

    pub(crate) fn callback(
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        Self::with_source(ErrorKind::Callback, message, source)
    }
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.sdk {
            Some(sdk) if self.message.is_empty() => write!(f, "{}: {}", sdk.code, sdk.message),
            _ => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for ClientError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source
            .as_deref()
            .map(|source| source as &(dyn std::error::Error + 'static))
    }
}

impl From<SdkError> for ClientError {
    fn from(sdk: SdkError) -> Self {
        Self {
            sdk: Some(Box::new(sdk)),
            ..Self::new(ErrorKind::Sdk, "")
        }
    }
}

impl From<tonic::Status> for ClientError {
    fn from(status: tonic::Status) -> Self {
        let metadata = status.metadata();
        let sdk = metadata
            .get("zama-error-code")
            .and_then(|v| v.to_str().ok())
            .map(|code| SdkError {
                code: code.into(),
                message: status.message().into(),
                retryable: metadata
                    .get("zama-error-retryable")
                    .and_then(|v| v.to_str().ok())
                    == Some("true"),
                retry_after_seconds: metadata
                    .get("zama-error-retry-after-seconds")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok()),
                // Revert data travels over gRPC trailers via the dedicated reply variant, not here.
                revert_data: None,
            });
        let kind = match status.code() {
            tonic::Code::InvalidArgument | tonic::Code::OutOfRange => ErrorKind::InvalidInput,
            tonic::Code::DeadlineExceeded => ErrorKind::Timeout,
            tonic::Code::Cancelled => ErrorKind::Cancelled,
            tonic::Code::Unavailable | tonic::Code::ResourceExhausted => ErrorKind::Transport,
            tonic::Code::NotFound => ErrorKind::ContextLost,
            tonic::Code::FailedPrecondition => ErrorKind::Sdk,
            tonic::Code::Internal
            | tonic::Code::Unimplemented
            | tonic::Code::DataLoss
            | tonic::Code::Unknown => ErrorKind::Protocol,
            _ => ErrorKind::Transport,
        };
        // The SDK code from the trailer names the failure; the gRPC status alone does not.
        let message = match &sdk {
            Some(sdk) => format!("{}: {}", sdk.code, status.message()),
            None => status.message().to_owned(),
        };
        Self {
            kind,
            message,
            sdk: sdk.map(Box::new),
            source: Some(Arc::new(status)),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
#[non_exhaustive]
pub struct SdkError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub retry_after_seconds: Option<u32>,
    /// Raw revert return data for a pre-broadcast simulation revert; absent otherwise.
    pub revert_data: Option<Vec<u8>>,
}

impl SdkError {
    pub fn chain_mismatch(message: impl Into<String>) -> Self {
        Self {
            code: "CHAIN_MISMATCH".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
    }

    pub fn signing_rejected(message: impl Into<String>) -> Self {
        Self {
            code: "SIGNING_REJECTED".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
    }

    pub fn signing_failed(message: impl Into<String>) -> Self {
        Self {
            code: "SIGNING_FAILED".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
    }

    pub fn signer_not_configured(message: impl Into<String>) -> Self {
        Self {
            code: "SIGNER_NOT_CONFIGURED".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
    }

    /// A contract write may have reached the network without yielding a hash.
    pub fn transaction_outcome_unknown(message: impl Into<String>) -> Self {
        Self {
            code: "TRANSACTION_OUTCOME_UNKNOWN".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
    }

    /// The node rejected the write during simulation or gas estimation; nothing was broadcast.
    pub fn execution_reverted(message: impl Into<String>, data: Vec<u8>) -> Self {
        Self {
            code: "TRANSACTION_REVERTED".into(),
            message: message.into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: Some(data),
        }
    }
}

impl fmt::Display for SdkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for SdkError {}

impl From<crate::generated::SdkError> for SdkError {
    fn from(value: crate::generated::SdkError) -> Self {
        Self {
            code: value.code,
            message: value.message,
            retryable: value.retryable,
            retry_after_seconds: value.retry_after_seconds,
            // The wire SdkError has no revert data; it travels in the ExecutionRevert reply.
            revert_data: None,
        }
    }
}
impl From<SdkError> for crate::generated::SdkError {
    fn from(value: SdkError) -> Self {
        Self {
            code: value.code,
            message: value.message,
            retryable: value.retryable,
            retry_after_seconds: value.retry_after_seconds,
        }
    }
}

/// First SDK error in the cause chain, direct or carried by a `ClientError`.
pub(crate) fn sdk_error_in_chain(error: &anyhow::Error) -> Option<SdkError> {
    error.chain().find_map(|cause| {
        cause.downcast_ref::<SdkError>().cloned().or_else(|| {
            cause
                .downcast_ref::<ClientError>()
                .and_then(|error| error.sdk_error().cloned())
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_public_error<T: std::error::Error + Send + Sync + 'static>() {}

    fn status_with_code(code: tonic::Code, sdk_code: &str) -> tonic::Status {
        let mut status = tonic::Status::new(code, "failure");
        status
            .metadata_mut()
            .insert("zama-error-code", sdk_code.parse().unwrap());
        status
    }

    #[test]
    fn client_error_is_a_thread_safe_standard_error() {
        assert_public_error::<ClientError>();
    }

    #[test]
    fn error_kind_is_hashable() {
        let kinds: std::collections::HashSet<_> = [ErrorKind::Sdk, ErrorKind::Sdk].into();
        assert_eq!(kinds.len(), 1);
    }

    #[test]
    fn rpc_status_code_determines_the_kind() {
        for (code, kind) in [
            (tonic::Code::InvalidArgument, ErrorKind::InvalidInput),
            (tonic::Code::OutOfRange, ErrorKind::InvalidInput),
            (tonic::Code::DeadlineExceeded, ErrorKind::Timeout),
            (tonic::Code::Cancelled, ErrorKind::Cancelled),
            (tonic::Code::Unavailable, ErrorKind::Transport),
            (tonic::Code::ResourceExhausted, ErrorKind::Transport),
            (tonic::Code::NotFound, ErrorKind::ContextLost),
            (tonic::Code::FailedPrecondition, ErrorKind::Sdk),
            (tonic::Code::Internal, ErrorKind::Protocol),
            (tonic::Code::Unimplemented, ErrorKind::Protocol),
            (tonic::Code::DataLoss, ErrorKind::Protocol),
            (tonic::Code::Unknown, ErrorKind::Protocol),
            (tonic::Code::PermissionDenied, ErrorKind::Transport),
            (tonic::Code::Aborted, ErrorKind::Transport),
        ] {
            let error = ClientError::from(tonic::Status::new(code, "failure"));
            assert_eq!(error.kind(), kind, "{code:?}");
            assert!(error.sdk_error().is_none());
            assert_eq!(error.to_string(), "failure");
            let status = std::error::Error::source(&error)
                .unwrap()
                .downcast_ref::<tonic::Status>()
                .unwrap();
            assert_eq!(status.code(), code);
        }
    }

    #[test]
    fn sdk_trailers_are_parsed_while_the_kind_follows_the_status() {
        let mut status = status_with_code(tonic::Code::Unavailable, "RELAYER_FAILED");
        status
            .metadata_mut()
            .insert("zama-error-retryable", "true".parse().unwrap());
        status
            .metadata_mut()
            .insert("zama-error-retry-after-seconds", "7".parse().unwrap());
        let error = ClientError::from(status);
        assert_eq!(error.kind(), ErrorKind::Transport);
        let sdk = error.sdk_error().unwrap();
        assert_eq!(sdk.code, "RELAYER_FAILED");
        assert_eq!(sdk.message, "failure");
        assert!(sdk.retryable);
        assert_eq!(sdk.retry_after_seconds, Some(7));
        assert_eq!(error.to_string(), "RELAYER_FAILED: failure");

        let error = ClientError::from(status_with_code(
            tonic::Code::InvalidArgument,
            "INVALID_ADDRESS",
        ));
        assert_eq!(error.kind(), ErrorKind::InvalidInput);
        assert_eq!(error.sdk_error().unwrap().code, "INVALID_ADDRESS");
    }

    #[test]
    fn display_does_not_repeat_the_source() {
        let error = ClientError::from(tonic::Status::unavailable("down"));
        let source = std::error::Error::source(&error).unwrap().to_string();
        assert!(!error.to_string().contains(&source));

        let io = std::io::Error::other("disk unplugged");
        let error = ClientError::transport("sidecar connection failed", io);
        assert_eq!(error.to_string(), "sidecar connection failed");
        assert_eq!(
            std::error::Error::source(&error).unwrap().to_string(),
            "disk unplugged"
        );
    }

    #[test]
    fn outcome_is_unknown_only_for_ambiguous_failures() {
        assert!(ClientError::timeout("sidecar request timed out").is_outcome_unknown());
        assert!(ClientError::from(tonic::Status::unavailable("down")).is_outcome_unknown());
        assert!(
            ClientError::from(status_with_code(
                tonic::Code::FailedPrecondition,
                "TRANSACTION_OUTCOME_UNKNOWN",
            ))
            .is_outcome_unknown()
        );
        assert!(
            !ClientError::from(status_with_code(
                tonic::Code::FailedPrecondition,
                "ENCRYPTION_FAILED",
            ))
            .is_outcome_unknown()
        );
        assert!(!ClientError::protocol("bad frame").is_outcome_unknown());
    }

    #[test]
    fn sdk_error_display_names_the_code() {
        let error = ClientError::from(SdkError::signing_rejected("no"));
        assert_eq!(error.kind(), ErrorKind::Sdk);
        assert_eq!(error.to_string(), "SIGNING_REJECTED: no");
        assert!(std::error::Error::source(&error).is_none());
    }
}
