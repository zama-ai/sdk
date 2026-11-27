use crate::{ClientError, Result, SdkBuilder, SdkConfig, generated, types::SignerConfig};
use generated::daemon_service_client::DaemonServiceClient;
use hyper_util::rt::TokioIo;
use std::{future::Future, path::Path, time::Duration};
use tokio::net::UnixStream;
use tonic::transport::{Channel, Endpoint};
use tower::service_fn;

pub(crate) type Service = DaemonServiceClient<Channel>;
#[derive(Clone)]
pub struct Client {
    inner: Service,
    pub(crate) timeout: Option<Duration>,
}

/// The daemon runs as the application's UID, so a peer with another UID is not the daemon.
async fn connect_daemon(socket: &Path, expected_uid: u32) -> std::io::Result<UnixStream> {
    let stream = UnixStream::connect(socket).await?;
    let uid = stream.peer_cred()?.uid();
    if uid != expected_uid {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            format!("daemon socket peer runs as UID {uid}, expected UID {expected_uid}"),
        ));
    }
    Ok(stream)
}

impl Client {
    pub async fn connect(socket: impl AsRef<Path>) -> Result<Self> {
        let socket = socket.as_ref().to_owned();
        let uid = rustix::process::geteuid().as_raw();
        let channel = Endpoint::from_static("http://localhost")
            .connect_timeout(Duration::from_secs(10))
            .connect_with_connector(service_fn(move |_| {
                let socket = socket.clone();
                async move { connect_daemon(&socket, uid).await.map(TokioIo::new) }
            }))
            .await
            .map_err(|error| ClientError::transport("failed to connect to daemon", error))?;
        Ok(Self {
            inner: DaemonServiceClient::new(channel)
                .max_decoding_message_size(4 * 1024 * 1024)
                .max_encoding_message_size(4 * 1024 * 1024),
            timeout: None,
        })
    }
    pub fn sdk(&self, config: SdkConfig) -> SdkBuilder {
        SdkBuilder::new(self.clone(), config)
    }
    pub fn with_message_limit(mut self, bytes: usize) -> Self {
        self.inner = self
            .inner
            .max_decoding_message_size(bytes)
            .max_encoding_message_size(bytes);
        self
    }
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
    pub(crate) fn service(&self) -> Service {
        self.inner.clone()
    }
    pub(crate) async fn unary<T, R, F>(
        &self,
        message: T,
        operation: impl FnOnce(Service, tonic::Request<T>) -> F,
    ) -> Result<R>
    where
        F: Future<Output = std::result::Result<tonic::Response<R>, tonic::Status>>,
    {
        let mut request = tonic::Request::new(message);
        let response = if let Some(timeout) = self.timeout {
            request.set_timeout(timeout);
            tokio::time::timeout(timeout, operation(self.service(), request))
                .await
                .map_err(|_| ClientError::timeout("daemon request timed out"))?
        } else {
            operation(self.service(), request).await
        };
        Ok(response?.into_inner())
    }
    pub async fn sdk_version(&self) -> Result<String> {
        Ok(self
            .unary(generated::GetInfoRequest {}, |mut inner, r| async move {
                inner.get_info(r).await
            })
            .await?
            .sdk_version)
    }
    pub(crate) async fn create_context_with_storage(
        &self,
        config: generated::ContextConfig,
        signer: SignerConfig,
        storage: Option<generated::StorageBinding>,
        permit_storage: Option<generated::StorageBinding>,
        transport_key_pair_derivation_secret: Option<generated::DerivationSecret>,
    ) -> Result<String> {
        let (signer_enabled, account) = match signer {
            SignerConfig::Disabled => (false, None),
            SignerConfig::Enabled(account) => (true, account.map(Into::into)),
        };
        let response = self
            .unary(
                generated::CreateContextRequest {
                    config: Some(config),
                    signer_enabled,
                    account,
                    storage,
                    permit_storage,
                    client_language: generated::ClientLanguage::Rust as i32,
                    transport_key_pair_derivation_secret,
                },
                |mut inner, r| async move { inner.create_context(r).await },
            )
            .await?;
        if response.context_id.is_empty() {
            return Err(ClientError::protocol("missing SDK context ID"));
        }
        Ok(response.context_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_daemon_checks_the_peer_uid() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("s");
        let _listener = tokio::net::UnixListener::bind(&socket).unwrap();
        let uid = rustix::process::geteuid().as_raw();

        connect_daemon(&socket, uid).await.unwrap();
        let error = connect_daemon(&socket, uid + 1).await.unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
    }
}
