use crate::{
    Client, ClientError, Decryption, Offline, Permits, Result, WalletAccount, generated, lifetime,
    operations,
};
use std::{sync::Arc, time::Duration};

#[derive(Clone, Copy, Debug)]
pub enum CallbackChannel {
    Signer,
    Storage,
    Events,
}

#[derive(Clone)]
pub struct Sdk {
    pub(crate) client: Client,
    pub(crate) context_id: Arc<str>,
    pub(crate) operations: Arc<operations::Operations>,
    resources: Arc<lifetime::Resources>,
}

impl Sdk {
    pub(crate) fn from_context(
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

    pub(crate) fn operation(&self) -> operations::OperationGuard {
        self.operations.start(&self.context_id)
    }
}
