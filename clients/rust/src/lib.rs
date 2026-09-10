macro_rules! rpc {
    ($sdk:expr, $method:ident, $request:ident { $($fields:tt)* }) => {
        async {
            let sdk = $sdk;
            let operation = sdk.operation();
            let request = crate::generated::$request {
                operation: Some(operation.message.clone()),
                $($fields)*
            };
            let mut client = sdk.client.inner.clone();
            let result = crate::unary(request, sdk.client.timeout, |request| client.$method(request)).await;
            drop(operation);
            result
        }
    };
}

#[cfg(feature = "alloy")]
pub mod alloy;
mod builder;
mod channel;
mod config;
mod decryption;
mod error;
mod lifetime;
mod operations;
mod permits;
mod signer;
mod storage;
mod storage_channel;
mod types;

pub use alloy_primitives::{Address, B256};
pub use async_trait::async_trait;
pub use builder::SdkBuilder;
pub use config::{ChainConfig, RelayerAuth, SdkConfig};
pub use decryption::{
    BatchItem, Decryption, DelegatedBatchOptions, DelegatedOptions, PublicDecryption,
};
pub use error::{RpcError, SdkError};
pub use num_bigint::BigInt;
pub use permits::{Offline, Permits, PreparePermit};
pub use signer::{Signer, SigningRequest};
pub use storage::{ApplicationStorage, MemoryStorage, NativeStorage, Storage};
pub use types::{ClearValue, ClearValues, EncryptedInput, WalletAccount};
#[allow(clippy::enum_variant_names)]
mod generated {
    include!("zama.sdk.v1alpha1.rs");
}

use anyhow::{Context, Result};
use generated::sidecar_service_client::SidecarServiceClient;
use hyper_util::rt::TokioIo;
use std::{future::Future, path::Path, sync::Arc, time::Duration};
use tonic::transport::{Channel, Endpoint};
use tower::service_fn;
use types::SignerConfig;

type Service = SidecarServiceClient<Channel>;
#[derive(Clone)]
pub struct Client {
    inner: Service,
    timeout: Option<Duration>,
}

#[derive(Clone, Copy, Debug)]
pub enum CallbackChannel {
    Signer,
    Storage,
}

#[derive(Clone)]
pub struct Sdk {
    client: Client,
    context_id: Arc<str>,
    operations: Arc<operations::Operations>,
    resources: Arc<lifetime::Resources>,
}

impl Client {
    pub async fn connect(socket: impl AsRef<Path>) -> Result<Self> {
        let socket = socket.as_ref().to_owned();
        let channel = Endpoint::from_static("http://localhost")
            .connect_timeout(Duration::from_secs(10))
            .connect_with_connector(service_fn(move |_| {
                let socket = socket.clone();
                async move {
                    tokio::net::UnixStream::connect(socket)
                        .await
                        .map(TokioIo::new)
                }
            }))
            .await?;
        Ok(Self {
            inner: SidecarServiceClient::new(channel)
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
    pub async fn sdk_version(&self) -> Result<String> {
        let mut inner = self.inner.clone();
        Ok(unary(generated::GetInfoRequest {}, self.timeout, |r| {
            inner.get_info(r)
        })
        .await?
        .sdk_version)
    }
    #[cfg(test)]
    async fn create_context(
        &self,
        config: &serde_json::Value,
        signer: SignerConfig,
    ) -> Result<Sdk> {
        let context_id = self
            .create_context_with_storage(config, signer, None, None)
            .await?;
        Ok(Sdk::from_context(
            self.clone(),
            context_id.clone(),
            Arc::new(operations::Operations::new()),
            lifetime::Resources::new(self.inner.clone(), context_id.clone(), None, None),
        ))
    }
    async fn create_context_with_storage(
        &self,
        config: &serde_json::Value,
        signer: SignerConfig,
        storage: Option<generated::StorageBinding>,
        permit_storage: Option<generated::StorageBinding>,
    ) -> Result<String> {
        let (signer_enabled, account) = match signer {
            SignerConfig::Disabled => (false, None),
            SignerConfig::Enabled(account) => (true, account.map(Into::into)),
        };
        let mut inner = self.inner.clone();
        let response = unary(
            generated::CreateContextRequest {
                config_json: serde_json::to_string(config)?,
                signer_enabled,
                account,
                storage,
                permit_storage,
            },
            self.timeout,
            |r| inner.create_context(r),
        )
        .await?;
        anyhow::ensure!(!response.context_id.is_empty(), "missing SDK context ID");
        Ok(response.context_id)
    }
}
impl Sdk {
    fn from_context(
        client: Client,
        context_id: String,
        operations: Arc<operations::Operations>,
        resources: lifetime::Resources,
    ) -> Self {
        Self {
            resources: Arc::new(resources),
            client,
            context_id: context_id.into(),
            operations,
        }
    }
    /// Waits for channel termination; cancellation of this wait leaves the channel running.
    pub async fn wait_channel_closed(&self, channel: CallbackChannel) -> Result<()> {
        let connection = match channel {
            CallbackChannel::Signer => self.resources.signer.as_ref(),
            CallbackChannel::Storage => self.resources.storage.as_ref(),
        }
        .context("SDK has no such callback channel")?;
        connection.wait().await
    }
    pub fn context_id(&self) -> &str {
        &self.context_id
    }
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.client.timeout = Some(timeout);
        self
    }
    pub fn decryption(&self) -> Decryption {
        Decryption(self.clone())
    }
    pub fn permits(&self) -> Permits {
        Permits(self.clone())
    }
    pub fn offline(&self) -> Offline {
        Offline(self.clone())
    }
    pub async fn update_account(&self, account: Option<WalletAccount>) -> Result<()> {
        let mut inner = self.client.inner.clone();
        unary(
            generated::UpdateAccountRequest {
                context_id: self.context_id.to_string(),
                account: account.map(Into::into),
            },
            self.client.timeout,
            |r| inner.update_account(r),
        )
        .await?;
        Ok(())
    }
    pub async fn close(&self) -> Result<()> {
        self.resources.close(self.client.timeout).await
    }

    fn operation(&self) -> operations::OperationGuard {
        self.operations.start(&self.context_id)
    }
}
async fn unary<T, R, F>(
    message: T,
    timeout: Option<Duration>,
    operation: impl FnOnce(tonic::Request<T>) -> F,
) -> Result<R>
where
    F: Future<Output = Result<tonic::Response<R>, tonic::Status>>,
{
    let mut request = tonic::Request::new(message);
    let response = if let Some(timeout) = timeout {
        request.set_timeout(timeout);
        tokio::time::timeout(timeout, operation(request))
            .await
            .context("sidecar request timed out")?
    } else {
        operation(request).await
    };
    Ok(response.map_err(RpcError::from)?.into_inner())
}

#[cfg(test)]
mod tests;
