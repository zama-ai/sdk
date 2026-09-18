use std::fmt;

#[derive(Clone, Debug, PartialEq)]
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

#[derive(Clone, Debug)]
pub struct RpcError {
    pub status: tonic::Status,
    pub sdk: Option<SdkError>,
}
impl From<tonic::Status> for RpcError {
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
        Self { status, sdk }
    }
}
impl fmt::Display for RpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // The SDK code from the trailer names the failure; the gRPC status alone does not.
        match &self.sdk {
            Some(sdk) => write!(f, "{}: {}", sdk.code, self.status.message()),
            None => self.status.fmt(f),
        }
    }
}
impl std::error::Error for RpcError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.status)
    }
}
