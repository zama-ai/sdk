use crate::{NativeStorage, RpcError, SdkError, generated};
use anyhow::{Context, Result, ensure};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::{sync::mpsc, task::JoinSet};

pub(crate) async fn attach_storage(
    mut client: crate::Service,
    context_id: &str,
    backends: HashMap<String, Arc<dyn NativeStorage>>,
) -> Result<crate::channel::Connection> {
    use generated::{
        storage_client_message::Message as ClientMessage,
        storage_server_message::Message as ServerMessage,
    };
    let (sender, mut stream) = crate::channel::attach(
        generated::StorageClientMessage {
            message: Some(ClientMessage::Attach(generated::ContextRequest {
                context_id: context_id.into(),
            })),
        },
        |receiver| client.storage_channel(receiver),
        |first| matches!(first.message, Some(ServerMessage::Attached(_))),
        "storage",
        Duration::from_secs(10),
    )
    .await?;
    Ok(crate::channel::Connection::spawn(async move {
        let mut callbacks = Callbacks {
            backends,
            sender,
            tasks: JoinSet::new(),
        };
        loop {
            tokio::select! {
                message = stream.message() => {
                    let Some(message) = message.map_err(RpcError::from)? else { return Ok(()); };
                    callbacks.handle_frame(message)?;
                },
                result = callbacks.tasks.join_next(), if !callbacks.tasks.is_empty() => {
                    result.context("missing storage callback task")???;
                }
            }
        }
    }))
}
struct Callbacks {
    backends: HashMap<String, Arc<dyn NativeStorage>>,
    sender: mpsc::Sender<generated::StorageClientMessage>,
    tasks: JoinSet<Result<()>>,
}
impl Callbacks {
    fn handle_frame(&mut self, frame: generated::StorageServerMessage) -> Result<()> {
        use generated::storage_server_message::Message;
        match frame.message {
            Some(Message::Action(action)) => {
                ensure!(!action.request_id.is_empty(), "missing storage request ID");
                let backend = self.backends.get(&action.backend_id).cloned();
                let sender = self.sender.clone();
                self.tasks.spawn(async move {
                    let (value, error) = match execute(backend, &action).await {
                        Ok(value) => (value, None),
                        Err(error) => (None, Some(storage_error(error).into())),
                    };
                    let reply = generated::StorageReply {
                        request_id: action.request_id,
                        value,
                        error,
                    };
                    sender
                        .send(generated::StorageClientMessage {
                            message: Some(generated::storage_client_message::Message::Reply(reply)),
                        })
                        .await?;
                    Ok(())
                });
                Ok(())
            }
            Some(Message::ReplyError(error)) => {
                crate::channel::check_reply_error(error.error, "STORAGE_REQUEST_NOT_FOUND")
            }
            _ => anyhow::bail!("unexpected storage channel frame"),
        }
    }
}
async fn execute(
    backend: Option<Arc<dyn NativeStorage>>,
    action: &generated::StorageAction,
) -> Result<Option<Vec<u8>>> {
    let backend = backend.ok_or_else(|| invalid("Unknown storage backend."))?;
    match generated::StorageMethod::try_from(action.method) {
        Ok(generated::StorageMethod::Get) => backend.get(&action.key).await,
        Ok(generated::StorageMethod::Set) => {
            backend.set(&action.key, action.value.clone()).await?;
            Ok(None)
        }
        Ok(generated::StorageMethod::Delete) => {
            backend.delete(&action.key).await?;
            Ok(None)
        }
        _ => Err(invalid("Unknown storage operation.").into()),
    }
}
fn invalid(message: &str) -> SdkError {
    SdkError {
        code: "STORAGE_FAILED".into(),
        message: message.into(),
        retryable: false,
        retry_after_seconds: None,
    }
}

fn storage_error(error: anyhow::Error) -> SdkError {
    error
        .downcast_ref::<SdkError>()
        .cloned()
        .or_else(|| {
            error
                .downcast_ref::<RpcError>()
                .and_then(|rpc| rpc.sdk.clone())
        })
        .unwrap_or_else(|| invalid(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_wrapped_rpc_storage_metadata() {
        let expected = SdkError {
            code: "STORAGE_FAILED".into(),
            message: "retry".into(),
            retryable: true,
            retry_after_seconds: Some(2.0),
        };
        let error = RpcError {
            status: tonic::Status::unavailable("retry"),
            sdk: Some(expected.clone()),
        };
        assert_eq!(
            storage_error(anyhow::Error::new(error).context("backend call")),
            expected
        );
    }
}
