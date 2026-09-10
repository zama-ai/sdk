#[cfg(test)]
use crate::Sdk;
use crate::{RpcError, SdkError, WalletAccount, generated};
use anyhow::{Context, Result};
use std::{collections::HashMap, future::Future, sync::Arc};
use tokio::{
    sync::mpsc,
    task::{AbortHandle, JoinSet},
};

#[derive(Clone, Debug)]
pub struct SigningRequest {
    pub operation_id: String,
    pub action_id: String,
    pub account: WalletAccount,
    pub typed_data: serde_json::Value,
}

#[async_trait::async_trait]
pub trait Signer: Send + Sync {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError>;
}
#[async_trait::async_trait]
impl<F, Fut> Signer for F
where
    F: Fn(SigningRequest) -> Fut + Send + Sync,
    Fut: Future<Output = Result<Vec<u8>, SdkError>> + Send,
{
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        self(request).await
    }
}

pub(crate) async fn attach_signer(
    mut client: crate::Service,
    context_id: &str,
    operations: Arc<crate::operations::Operations>,
    sign: Arc<dyn Signer>,
) -> Result<crate::channel::Connection> {
    use generated::{
        signer_client_message::Message as ClientMessage,
        signer_server_message::Message as ServerMessage,
    };
    let (sender, mut stream) = crate::channel::attach(
        generated::SignerClientMessage {
            message: Some(ClientMessage::Attach(generated::ContextRequest {
                context_id: context_id.into(),
            })),
        },
        |receiver| client.signer_channel(receiver),
        |first| matches!(first.message, Some(ServerMessage::Attached(_))),
        "signer",
        std::time::Duration::from_secs(5),
    )
    .await?;
    let mut cancelled = operations.cancelled.subscribe();
    Ok(crate::channel::Connection::spawn(async move {
        let mut callbacks = Callbacks {
            sign,
            sender,
            operations,
            tasks: JoinSet::new(),
            pending: HashMap::new(),
        };
        loop {
            tokio::select! {
                frame = stream.message() => {
                    let Some(frame) = frame.map_err(RpcError::from)? else { return Ok(()); };
                    callbacks.handle_frame(frame)?;
                },
                result = cancelled.recv() => {
                    match result {
                        Ok(_) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => callbacks.sweep_cancelled(),
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => return Ok(()),
                    }
                },
                result = callbacks.tasks.join_next(), if !callbacks.tasks.is_empty() => {
                    callbacks.settle(result.context("missing signer callback task")?)?;
                }
            }
        }
    }))
}

type ActionKey = (String, String);
enum Pending {
    Running(AbortHandle),
    Settled,
}
impl Pending {
    fn cancel(&mut self) {
        if let Self::Running(task) = std::mem::replace(self, Self::Settled) {
            task.abort();
        }
    }
}
struct Callbacks {
    sign: Arc<dyn Signer>,
    sender: mpsc::Sender<generated::SignerClientMessage>,
    operations: Arc<crate::operations::Operations>,
    tasks: JoinSet<Result<ActionKey>>,
    // Settled actions remain a replay guard until their owning operation ends.
    pending: HashMap<ActionKey, Pending>,
}
impl Callbacks {
    fn handle_frame(&mut self, frame: generated::SignerServerMessage) -> Result<()> {
        use generated::signer_server_message::Message;
        match frame.message {
            Some(Message::Action(action)) => self.start(action),
            Some(Message::Cancelled(cancelled)) => {
                if let Some(pending) = self
                    .pending
                    .get_mut(&(cancelled.operation_id, cancelled.action_id))
                {
                    pending.cancel();
                }
                Ok(())
            }
            Some(Message::ReplyError(error)) => {
                crate::channel::check_reply_error(error.error, "SIGNER_ACTION_NOT_FOUND")
            }
            _ => anyhow::bail!("unexpected signer channel frame"),
        }
    }
    fn start(&mut self, action: generated::SignerAction) -> Result<()> {
        // An operation can finish while its last signer action is still in transit.
        if !self.operations.contains(&action.operation_id) {
            return Ok(());
        }
        let key = (action.operation_id.clone(), action.action_id.clone());
        if self.pending.contains_key(&key) {
            return Ok(());
        }
        let request = SigningRequest {
            operation_id: action.operation_id,
            action_id: action.action_id,
            account: action
                .account
                .context("missing signer account")?
                .try_into()?,
            typed_data: serde_json::from_str(&action.typed_data_json)?,
        };
        let sign = self.sign.clone();
        let sender = self.sender.clone();
        let result_key = key.clone();
        let abort = self.tasks.spawn(async move {
            let (signature, error) = match sign.sign_typed_data(request).await {
                Ok(signature) => (signature, None),
                Err(error) => (Vec::new(), Some(error.into())),
            };
            let reply = generated::SignerReply {
                operation_id: result_key.0.clone(),
                action_id: result_key.1.clone(),
                signature,
                error,
            };
            sender
                .send(generated::SignerClientMessage {
                    message: Some(generated::signer_client_message::Message::Reply(reply)),
                })
                .await?;
            Ok(result_key)
        });
        self.pending.insert(key, Pending::Running(abort));
        Ok(())
    }
    fn sweep_cancelled(&mut self) {
        self.pending.retain(|(operation, _), pending| {
            if self.operations.contains(operation) {
                return true;
            }
            pending.cancel();
            false
        });
    }
    fn settle(&mut self, result: Result<Result<ActionKey>, tokio::task::JoinError>) -> Result<()> {
        match result {
            Err(error) if error.is_cancelled() => Ok(()),
            result => {
                let key = result??;
                if let Some(pending) = self.pending.get_mut(&key) {
                    *pending = Pending::Settled;
                }
                Ok(())
            }
        }
    }
}

#[cfg(test)]
impl Sdk {
    pub(crate) async fn attach_signer<F, Fut>(&self, sign: F) -> Result<crate::channel::Connection>
    where
        F: Fn(SigningRequest) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Vec<u8>, SdkError>> + Send + 'static,
    {
        attach_signer(
            self.client.inner.clone(),
            &self.context_id,
            self.operations.clone(),
            Arc::new(sign),
        )
        .await
    }
}
