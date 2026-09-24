macro_rules! rpc {
    ($sdk:expr, $method:ident, $request:ident { $($fields:tt)* }) => {
        async {
            let sdk = $sdk;
            let operation = sdk.operation();
            let request = crate::generated::$request {
                operation: Some(operation.message.clone()),
                $($fields)*
            };
            let result = sdk
                .client
                .unary(request, |mut client, request| async move { client.$method(request).await })
                .await;
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
mod config_options;
mod decryption;
mod delegations;
mod encryption;
mod error;
mod event_channel;
mod events;
mod lifetime;
mod offline;
mod operations;
mod permits;
mod signer;
mod storage;
mod storage_channel;
mod transactions;
mod types;

pub use alloy_primitives::{Address, B256};
pub use async_trait::async_trait;
pub use builder::SdkBuilder;
pub use config::{ChainConfig, RelayerAuth, SdkConfig};
pub use config_options::{
    CompatibilityCheck, DerivationSecret, FheCrsBytes, FheEncryptionKey, FheEncryptionKeyMetadata,
    FhePublicKeyBytes, KmsVersion, ModuleVersions, PinnedModuleVersions, ProcessRuntime,
    ProviderBatch, ProviderBatchOptions, ProviderOptions, RelayerConfig, RelayerOptions,
    RelayerTransport, TfheVersion, WasmAssetLoadMode,
};
pub use decryption::{
    BatchItem, Decryption, DelegatedBatchOptions, DelegatedOptions, PublicDecryption,
};
pub use delegations::{
    DelegateDecryptionParams, DelegationQuery, DelegationStatus, Delegations,
    PERMANENT_DELEGATION_EXPIRY, RevokeDelegationParams,
};
pub use encryption::{EncryptInput, EncryptOptions, EncryptParams, EncryptResult};
pub use error::{ClientError, ErrorKind, Result, SdkError};
pub use events::{
    ApprovalStep, EventContext, EventEnum, EventHandler, EventKind, EventOperation, Notification,
    OperationProgress, ProgressKind, SdkEvent, SdkEventKind, ShieldPath,
};
pub use num_bigint::BigInt;
pub use offline::{
    PrepareFees, PrepareOptions, PrepareTransaction, PreparedTransaction, Transaction,
    TransactionKind,
};
pub use permits::{Offline, Permits, PreparePermit, PreparedPermit};
pub use signer::{Signer, SigningRequest};
pub use storage::{ApplicationStorage, MemoryStorage, NativeStorage, Storage};
pub use tokio_util::sync::CancellationToken;
pub use transactions::{ContractWriteRequest, TransactionLog, TransactionResult};
pub use types::{ClearValue, ClearValues, EncryptedInput, WalletAccount};
#[allow(clippy::enum_variant_names)]
mod generated {
    include!("zama.sdk.v1alpha1.rs");
}

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
    Events,
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
            .await
            .map_err(|error| ClientError::transport("failed to connect to sidecar", error))?;
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
    fn service(&self) -> Service {
        self.inner.clone()
    }
    async fn unary<T, R, F>(
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
                .map_err(|_| ClientError::timeout("sidecar request timed out"))?
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
    #[cfg(test)]
    async fn create_context(&self, config: SdkConfig, signer: SignerConfig) -> Result<Sdk> {
        let context_id = self
            .create_context_with_storage(config.try_into()?, signer, None, None, None)
            .await?;
        Ok(Sdk::from_context(
            self.clone(),
            context_id.clone(),
            Arc::new(operations::Operations::new()),
            lifetime::Resources::new(self.clone(), context_id.clone(), None, None),
        ))
    }
    async fn create_context_with_storage(
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
            CallbackChannel::Events => self.resources.events.as_ref(),
        }
        .ok_or_else(|| ClientError::invalid_input("SDK has no such callback channel"))?;
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
        self.client
            .unary(
                generated::UpdateAccountRequest {
                    context_id: self.context_id.to_string(),
                    account: account.map(Into::into),
                },
                |mut inner, r| async move { inner.update_account(r).await },
            )
            .await?;
        Ok(())
    }
    pub async fn close(&self) -> Result<()> {
        self.resources.close(&self.client).await
    }

    fn operation(&self) -> operations::OperationGuard {
        self.operations.start(&self.context_id)
    }
}
#[cfg(test)]
mod tests;
