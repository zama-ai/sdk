pub(super) use crate::*;
pub(super) use generated::*;
pub(super) use http_body_util::{BodyExt, Full, StreamBody, combinators::BoxBody};
pub(super) use hyper::{
    Response,
    body::{Bytes, Frame, Incoming},
    server::conn::http2,
};
pub(super) use hyper_util::rt::TokioExecutor;
pub(super) use prost::Message;
pub(super) use std::{collections::HashMap, convert::Infallible, sync::Mutex};
pub(super) use tokio::sync::mpsc;
pub(super) use tokio_stream::{StreamExt, wrappers::UnboundedReceiverStream};

pub(super) type Body = BoxBody<Bytes, Infallible>;
pub(super) type Handler = Arc<dyn Fn(&str, &[u8]) -> Response<Body> + Send + Sync>;
pub(super) fn encoded<M: Message>(message: M) -> Bytes {
    let data = message.encode_to_vec();
    let mut frame = vec![0];
    frame.extend_from_slice(&(data.len() as u32).to_be_bytes());
    frame.extend(data);
    frame.into()
}
pub(super) fn response<M: Message>(message: M) -> Response<Body> {
    Response::builder()
        .header("content-type", "application/grpc")
        .header("grpc-status", "0")
        .body(Full::new(encoded(message)).boxed())
        .unwrap()
}
pub(super) fn duplex<I: Message + Default + Send + 'static, O: Message + Send + 'static>(
    mut body: Incoming,
    outgoing: mpsc::UnboundedReceiver<O>,
    incoming: mpsc::UnboundedSender<I>,
) -> Response<Body> {
    tokio::spawn(async move {
        let mut buffer = Vec::new();
        while let Some(Ok(frame)) = body.frame().await {
            if let Some(bytes) = frame.data_ref() {
                buffer.extend_from_slice(bytes);
            }
            while buffer.len() >= 5 {
                let length = u32::from_be_bytes(buffer[1..5].try_into().unwrap()) as usize;
                if buffer.len() < length + 5 {
                    break;
                }
                if incoming
                    .send(I::decode(&buffer[5..length + 5]).unwrap())
                    .is_err()
                {
                    return;
                }
                buffer.drain(..length + 5);
            }
        }
    });
    let frames = UnboundedReceiverStream::new(outgoing)
        .map(|m| Ok::<_, Infallible>(Frame::data(encoded(m))));
    Response::builder()
        .header("content-type", "application/grpc")
        .body(StreamBody::new(frames).boxed())
        .unwrap()
}
pub(super) struct Server {
    _directory: tempfile::TempDir,
    pub(super) socket: std::path::PathBuf,
    task: tokio::task::JoinHandle<()>,
    pub(super) actions: mpsc::UnboundedSender<SignerServerMessage>,
    pub(super) replies: mpsc::UnboundedReceiver<SignerClientMessage>,
    pub(super) timeouts: Arc<Mutex<Vec<bool>>>,
    pub(super) storage_actions: mpsc::UnboundedSender<StorageServerMessage>,
    pub(super) storage_replies: mpsc::UnboundedReceiver<StorageClientMessage>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Server {
    pub(super) async fn start(handler: Handler) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let socket = directory.path().join("test.sock");
        let listener = tokio::net::UnixListener::bind(&socket).unwrap();
        let (actions, receiver) = mpsc::unbounded_channel();
        let receiver = Arc::new(Mutex::new(Some(receiver)));
        let (send_reply, replies) = mpsc::unbounded_channel();
        let (storage_actions, storage_receiver) = mpsc::unbounded_channel();
        let storage_receiver = Arc::new(Mutex::new(Some(storage_receiver)));
        let (storage_reply, storage_replies) = mpsc::unbounded_channel();
        let timeouts = Arc::new(Mutex::new(Vec::new()));
        let observed_timeouts = timeouts.clone();
        let task = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            http2::Builder::new(TokioExecutor::new())
                .serve_connection(
                    TokioIo::new(stream),
                    hyper::service::service_fn(move |request: hyper::Request<Incoming>| {
                        let storage_receiver = storage_receiver.clone();
                        let storage_reply = storage_reply.clone();
                        let handler = handler.clone();
                        let receiver = receiver.clone();
                        let send_reply = send_reply.clone();
                        let timeouts = observed_timeouts.clone();
                        async move {
                            if request.uri().path().ends_with("/StorageChannel") {
                                let outgoing = storage_receiver.lock().unwrap().take().unwrap();
                                return Ok::<_, Infallible>(duplex(
                                    request.into_body(),
                                    outgoing,
                                    storage_reply,
                                ));
                            }
                            if request.uri().path().ends_with("/SignerChannel") {
                                let outgoing = receiver.lock().unwrap().take().unwrap();
                                return Ok::<_, Infallible>(duplex(
                                    request.into_body(),
                                    outgoing,
                                    send_reply,
                                ));
                            }

                            timeouts
                                .lock()
                                .unwrap()
                                .push(request.headers().contains_key("grpc-timeout"));
                            let path = request.uri().path().to_owned();
                            let bytes = request.into_body().collect().await.unwrap().to_bytes();
                            Ok(handler(&path, &bytes[5..]))
                        }
                    }),
                )
                .await
                .ok();
        });
        Self {
            _directory: directory,
            socket,
            task,
            actions,
            replies,
            timeouts,
            storage_actions,
            storage_replies,
        }
    }
    pub(super) async fn reply(&mut self) -> SignerClientMessage {
        tokio::time::timeout(Duration::from_secs(2), self.replies.recv())
            .await
            .unwrap()
            .unwrap()
    }
}
pub(super) fn default_handler(path: &str, bytes: &[u8]) -> Response<Body> {
    match path.rsplit('/').next().unwrap() {
        "CreateContext" => {
            let _ = CreateContextRequest::decode(bytes).unwrap();
            response(CreateContextResponse {
                context_id: "context".into(),
            })
        }
        "CloseContext" => response(CloseContextResponse {}),
        _ => panic!("unexpected RPC {path}"),
    }
}

pub(super) fn action(operation: &str, action: &str) -> SignerServerMessage {
    signer_action(
        operation,
        action,
        Some(generated::WalletAccount {
            address: vec![1; 20],
            chain_id: 1,
        }),
        "{}",
    )
}
pub(super) fn signer_action(
    operation: &str,
    action: &str,
    account: Option<generated::WalletAccount>,
    typed_data_json: &str,
) -> SignerServerMessage {
    SignerServerMessage {
        message: Some(signer_server_message::Message::Action(SignerAction {
            operation_id: operation.into(),
            action_id: action.into(),
            account,
            request: Some(generated::signer_action::Request::TypedDataJson(
                typed_data_json.into(),
            )),
        })),
    }
}

#[cfg(feature = "alloy")]
pub(super) struct FailingAlloySigner {
    pub(super) errors: Mutex<std::collections::VecDeque<alloy_signer::Error>>,
}

#[cfg(feature = "alloy")]
#[async_trait::async_trait]
impl alloy_signer::Signer for FailingAlloySigner {
    async fn sign_hash(&self, _hash: &B256) -> alloy_signer::Result<alloy_primitives::Signature> {
        let error = self.errors.lock().unwrap().pop_front().unwrap();
        Err(error)
    }

    fn address(&self) -> Address {
        Address::repeat_byte(1)
    }

    fn chain_id(&self) -> Option<u64> {
        Some(1)
    }

    fn set_chain_id(&mut self, _chain_id: Option<u64>) {}
}
