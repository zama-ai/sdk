#[cfg(test)]
use crate::Sdk;
use crate::{B256, ContractWriteRequest, RpcError, SdkError, WalletAccount, generated};
use anyhow::{Context, Result};
use std::{collections::HashMap, future::Future, sync::Arc};
use tokio::{
    sync::mpsc,
    task::{AbortHandle, JoinSet},
};
use tokio_util::sync::CancellationToken;

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

    /// Approves, signs and broadcasts once, returning the hash without waiting for a receipt.
    ///
    /// Returning [`SdkError::execution_reverted`] forwards a pre-broadcast revert: the node
    /// rejected the simulated write, so nothing was sent.
    async fn write_contract(
        &self,
        _request: ContractWriteRequest,
        _cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        Err(SdkError::signer_not_configured(
            "This signer does not support contract writes.",
        ))
    }
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
#[async_trait::async_trait]
impl<S: Signer + ?Sized> Signer for Arc<S> {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        (**self).sign_typed_data(request).await
    }
    async fn write_contract(
        &self,
        request: ContractWriteRequest,
        cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        (**self).write_contract(request, cancel).await
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

#[derive(Debug)]
enum CallbackRequest {
    TypedData(SigningRequest),
    ContractWrite(ContractWriteRequest),
}
impl CallbackRequest {
    fn decode(action: generated::SignerAction) -> Result<Self, SdkError> {
        let account: WalletAccount = action
            .account
            .ok_or_else(|| SdkError::signing_failed("Missing signer account."))?
            .try_into()
            .map_err(|error: anyhow::Error| {
                SdkError::signing_failed(format!("Invalid signer account: {error}"))
            })?;
        match action.request {
            Some(generated::signer_action::Request::TypedDataJson(typed_data_json)) => {
                Ok(Self::TypedData(SigningRequest {
                    operation_id: action.operation_id,
                    action_id: action.action_id,
                    account,
                    typed_data: serde_json::from_str(&typed_data_json).map_err(|error| {
                        SdkError::signing_failed(format!(
                            "Invalid signing request typed data: {error}"
                        ))
                    })?,
                }))
            }
            Some(generated::signer_action::Request::ContractWrite(write)) => {
                Ok(Self::ContractWrite(ContractWriteRequest::from_wire(
                    action.operation_id,
                    action.action_id,
                    account,
                    write,
                )?))
            }
            None => Err(SdkError::signing_failed("Missing signer request.")),
        }
    }
    async fn run(
        self,
        sign: &dyn Signer,
        cancel: CancellationToken,
    ) -> Result<generated::signer_reply::Result, SdkError> {
        use generated::signer_reply::Result as Reply;
        match self {
            Self::TypedData(request) => sign.sign_typed_data(request).await.map(Reply::Signature),
            Self::ContractWrite(request) => sign
                .write_contract(request, cancel)
                .await
                .map(|hash| Reply::TransactionHash(hash.to_vec())),
        }
    }
}

type ActionKey = (String, String);

enum Pending {
    Signing(AbortHandle),
    // A write is asked to stop rather than dropped, because dropping cannot recall a broadcast.
    Writing(CancellationToken),
    Settled,
}
impl Pending {
    fn cancel(&mut self) {
        match std::mem::replace(self, Self::Settled) {
            Self::Signing(task) => task.abort(),
            Self::Writing(token) => token.cancel(),
            Self::Settled => (),
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
        let cancel = CancellationToken::new();
        let pending = match CallbackRequest::decode(action) {
            // A write outlives the channel: teardown cannot recall a broadcast, so its task is
            // detached rather than held by the set that teardown aborts.
            Ok(request @ CallbackRequest::ContractWrite(_)) => {
                let task = self.run(Ok(request), key.clone(), cancel.clone());
                tokio::spawn(async move {
                    // A reply nobody is left to receive is not a failure of the write.
                    let _ = task.await;
                });
                Pending::Writing(cancel)
            }
            request => {
                let task = self.run(request, key.clone(), cancel);
                Pending::Signing(self.tasks.spawn(task))
            }
        };
        self.pending.insert(key, pending);
        Ok(())
    }
    /// Runs one decoded action and replies with its outcome unless it was cancelled.
    fn run(
        &self,
        request: Result<CallbackRequest, SdkError>,
        key: ActionKey,
        cancel: CancellationToken,
    ) -> impl Future<Output = Result<ActionKey>> + Send + 'static {
        let sign = self.sign.clone();
        let sender = self.sender.clone();
        // Only a contract write can be rejected pre-broadcast; a typed-data action always stays an error reply.
        let is_contract_write = matches!(request, Ok(CallbackRequest::ContractWrite(_)));
        async move {
            let result = match request {
                Ok(request) => request.run(sign.as_ref(), cancel.clone()).await,
                Err(error) => Err(error),
            };
            // A cancelled action has no reply to give.
            if cancel.is_cancelled() {
                return Ok(key);
            }
            let result = result.unwrap_or_else(|error| match error.revert_data {
                Some(data) if is_contract_write => {
                    generated::signer_reply::Result::ExecutionRevert(generated::ExecutionRevert {
                        data,
                        message: error.message,
                    })
                }
                _ => generated::signer_reply::Result::Error(error.into()),
            });
            let reply = generated::SignerReply {
                operation_id: key.0.clone(),
                action_id: key.1.clone(),
                result: Some(result),
            };
            sender
                .send(generated::SignerClientMessage {
                    message: Some(generated::signer_client_message::Message::Reply(reply)),
                })
                .await?;
            Ok(key)
        }
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

#[cfg(test)]
#[path = "transaction_tests.rs"]
mod transaction_tests;
