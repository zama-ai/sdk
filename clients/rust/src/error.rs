use std::fmt;

#[derive(Clone, Debug, PartialEq)]
pub struct SdkError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub retry_after_seconds: Option<f64>,
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
            });
        Self { status, sdk }
    }
}
impl fmt::Display for RpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.status.fmt(f)
    }
}
impl std::error::Error for RpcError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.status)
    }
}
