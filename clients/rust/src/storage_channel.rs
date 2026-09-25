use crate::error::sdk_error_in_chain;
use crate::{ClientError, ErrorKind, NativeStorage, Result, SdkError, generated};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::{sync::mpsc, task::JoinSet};

pub(crate) async fn attach_storage(
    mut client: crate::client::Service,
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
                    let Some(message) = message? else { return Ok(()); };
                    callbacks.handle_frame(message)?;
                },
                result = callbacks.tasks.join_next(), if !callbacks.tasks.is_empty() => {
                    result
                        .ok_or_else(|| ClientError::new(ErrorKind::Callback, "missing storage callback task"))?
                        .map_err(|error| ClientError::callback("storage callback task failed", error))??;
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
                if action.request_id.is_empty() {
                    return Err(ClientError::protocol("missing storage request ID"));
                }
                let backend = self.backends.get(&action.backend_id).cloned();
                let sender = self.sender.clone();
                self.tasks.spawn(async move {
                    let result = execute(backend, &action).await.unwrap_or_else(|error| {
                        generated::storage_reply::Result::Error(error.into())
                    });
                    let reply = generated::StorageReply {
                        request_id: action.request_id,
                        result: Some(result),
                    };
                    sender
                        .send(generated::StorageClientMessage {
                            message: Some(generated::storage_client_message::Message::Reply(reply)),
                        })
                        .await
                        .map_err(|_| ClientError::closed("storage reply channel closed"))?;
                    Ok(())
                });
                Ok(())
            }
            Some(Message::ReplyError(error)) => {
                crate::channel::check_reply_error(error.error, "STORAGE_REQUEST_NOT_FOUND")
            }
            _ => Err(ClientError::protocol("unexpected storage channel frame")),
        }
    }
}
async fn execute(
    backend: Option<Arc<dyn NativeStorage>>,
    action: &generated::StorageAction,
) -> std::result::Result<generated::storage_reply::Result, SdkError> {
    use generated::storage_reply::Result as Reply;
    let backend = backend.ok_or_else(|| invalid("Unknown storage backend."))?;
    match generated::StorageMethod::try_from(action.method) {
        Ok(generated::StorageMethod::Get) => Ok(
            match backend.get(&action.key).await.map_err(storage_error)? {
                Some(value) => Reply::Value(value),
                None => Reply::NotFound(generated::Empty {}),
            },
        ),
        Ok(generated::StorageMethod::Set) => {
            backend
                .set(&action.key, action.value.clone())
                .await
                .map_err(storage_error)?;
            Ok(Reply::Ack(generated::Empty {}))
        }
        Ok(generated::StorageMethod::Delete) => {
            backend.delete(&action.key).await.map_err(storage_error)?;
            Ok(Reply::Ack(generated::Empty {}))
        }
        _ => Err(invalid("Unknown storage operation.")),
    }
}
fn invalid(message: &str) -> SdkError {
    SdkError {
        code: "STORAGE_FAILED".into(),
        message: message.into(),
        retryable: false,
        retry_after_seconds: None,
        revert_data: None,
    }
}

fn storage_error(error: anyhow::Error) -> SdkError {
    sdk_error_in_chain(&error).unwrap_or_else(|| invalid(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_client_sdk_error_in_chain() {
        let expected = SdkError {
            code: "STORAGE_FAILED".into(),
            message: "retry".into(),
            retryable: true,
            retry_after_seconds: Some(2),
            revert_data: None,
        };
        let error = ClientError::from(expected.clone());
        assert_eq!(
            storage_error(anyhow::Error::new(error).context("backend call")),
            expected
        );
    }

    #[test]
    fn preserves_sdk_error_in_chain() {
        let expected = invalid("disk full");
        let error = anyhow::Error::new(expected.clone()).context("backend call");
        assert_eq!(storage_error(error), expected);
    }

    #[test]
    fn falls_back_to_the_error_message() {
        let error = storage_error(anyhow::Error::new(std::io::Error::other("disk full")));
        assert_eq!(error, invalid("disk full"));
    }
}
