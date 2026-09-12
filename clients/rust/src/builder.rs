use crate::{
    Client, Sdk, SdkConfig, Signer, SignerConfig, Storage, WalletAccount, operations::Operations,
    signer::attach_signer, storage_channel::attach_storage,
};
use anyhow::Result;
use std::{collections::HashMap, sync::Arc};

pub struct SdkBuilder {
    client: Client,
    config: SdkConfig,
    signer: Option<(Option<WalletAccount>, Arc<dyn Signer>)>,
    storage: Storage,
    permit_storage: Option<Storage>,
}
impl SdkBuilder {
    pub(crate) fn new(client: Client, config: SdkConfig) -> Self {
        Self {
            client,
            config,
            signer: None,
            storage: Storage::Memory,
            permit_storage: None,
        }
    }
    pub fn signer(mut self, account: Option<WalletAccount>, signer: impl Signer + 'static) -> Self {
        self.signer = Some((account, Arc::new(signer)));
        self
    }
    pub fn storage(mut self, storage: impl Into<Storage>) -> Self {
        self.storage = storage.into();
        self
    }
    pub fn permit_storage(mut self, storage: impl Into<Storage>) -> Self {
        self.permit_storage = Some(storage.into());
        self
    }
    pub async fn build(self) -> Result<Sdk> {
        let signer = self
            .signer
            .as_ref()
            .map_or(SignerConfig::Disabled, |(account, _)| {
                SignerConfig::Enabled(*account)
            });
        let mut backends = HashMap::new();
        for storage in std::iter::once(&self.storage).chain(self.permit_storage.as_ref()) {
            if let Storage::Application(storage) = storage
                && let Some(previous) = backends.insert(storage.id.clone(), storage.backend.clone())
            {
                anyhow::ensure!(
                    Arc::ptr_eq(&previous, &storage.backend),
                    "application storage identity refers to different backends"
                );
            }
        }
        let context_id = self
            .client
            .create_context_with_storage(
                &serde_json::to_value(&self.config)?,
                signer,
                Some(self.storage.wire()),
                self.permit_storage.as_ref().map(Storage::wire),
            )
            .await?;
        let operations = Arc::new(Operations::new());
        let mut resources = crate::lifetime::Resources::new(
            self.client.inner.clone(),
            context_id.clone(),
            None,
            None,
        );
        let result = async {
            if !backends.is_empty() {
                resources.storage =
                    Some(attach_storage(self.client.inner.clone(), &context_id, backends).await?);
            }
            if let Some((_, signer)) = self.signer {
                resources.signer = Some(
                    attach_signer(
                        self.client.inner.clone(),
                        &context_id,
                        operations.clone(),
                        signer,
                    )
                    .await?,
                );
            }
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if let Err(error) = result {
            let _ = resources
                .close(Some(std::time::Duration::from_secs(5)))
                .await;
            return Err(error);
        }
        Ok(Sdk::from_context(
            self.client,
            context_id,
            operations,
            resources,
        ))
    }
}
