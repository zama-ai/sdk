use super::*;
use generated::*;
use http_body_util::{BodyExt, Full, StreamBody, combinators::BoxBody};
use hyper::{
    Response,
    body::{Bytes, Frame, Incoming},
    server::conn::http2,
};
use hyper_util::rt::TokioExecutor;
use prost::Message;
use std::{convert::Infallible, sync::Mutex};
use tokio::sync::mpsc;
use tokio_stream::{StreamExt, wrappers::UnboundedReceiverStream};

type Body = BoxBody<Bytes, Infallible>;
type Handler = Arc<dyn Fn(&str, &[u8]) -> Response<Body> + Send + Sync>;
fn encoded<M: Message>(message: M) -> Bytes {
    let data = message.encode_to_vec();
    let mut frame = vec![0];
    frame.extend_from_slice(&(data.len() as u32).to_be_bytes());
    frame.extend(data);
    frame.into()
}
fn response<M: Message>(message: M) -> Response<Body> {
    Response::builder()
        .header("content-type", "application/grpc")
        .header("grpc-status", "0")
        .body(Full::new(encoded(message)).boxed())
        .unwrap()
}
fn duplex<I: Message + Default + Send + 'static, O: Message + Send + 'static>(
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
struct Server {
    _directory: tempfile::TempDir,
    socket: std::path::PathBuf,
    task: tokio::task::JoinHandle<()>,
    actions: mpsc::UnboundedSender<SignerServerMessage>,
    replies: mpsc::UnboundedReceiver<SignerClientMessage>,
    timeouts: Arc<Mutex<Vec<bool>>>,
    storage_actions: mpsc::UnboundedSender<StorageServerMessage>,
    storage_replies: mpsc::UnboundedReceiver<StorageClientMessage>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Server {
    async fn start(handler: Handler) -> Self {
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
    async fn reply(&mut self) -> SignerClientMessage {
        tokio::time::timeout(Duration::from_secs(2), self.replies.recv())
            .await
            .unwrap()
            .unwrap()
    }
}
fn default_handler(path: &str, bytes: &[u8]) -> Response<Body> {
    match path.rsplit('/').next().unwrap() {
        "CreateContext" => {
            let _ = CreateContextRequest::decode(bytes).unwrap();
            response(CreateContextResponse {
                context_id: "context".into(),
            })
        }
        "CloseContext" => response(Empty {}),
        _ => panic!("unexpected RPC {path}"),
    }
}

#[tokio::test]
async fn preserves_context_options_typed_values_and_sdk_errors() {
    let revoked = Arc::new(Mutex::new(Vec::new()));
    let observed = revoked.clone();
    let handler = move |path: &str, bytes: &[u8]| match path.rsplit('/').next().unwrap() {
        "CreateContext" => {
            let request = CreateContextRequest::decode(bytes).unwrap();
            assert!(!request.signer_enabled);
            assert!(request.account.is_none());
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&request.config_json).unwrap()["permitTTL"],
                90
            );
            response(CreateContextResponse {
                context_id: "context".into(),
            })
        }
        "DecryptValues" => {
            let request = DecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.operation.unwrap().context_id, "context");
            assert_eq!(request.timeout_ms, Some(0.5));
            use clear_value::Value;
            response(DecryptValuesResponse {
                values: [
                    Value::BigintValue("340282366920938463463374607431768211457".into()),
                    Value::BoolValue(false),
                    Value::StringValue("0x1234".into()),
                    Value::UndefinedValue(true),
                    Value::NumberValue(4_294_967_295.0),
                ]
                .into_iter()
                .enumerate()
                .map(|(i, value)| ClearEntry {
                    encrypted_value: vec![i as u8; 32],
                    value: Some(generated::ClearValue { value: Some(value) }),
                })
                .collect(),
            })
        }
        "DelegatedDecryptValues" => {
            let request = DelegatedDecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.delegator_address, vec![3; 20]);
            assert!(request.account_address.is_none());
            assert_eq!(request.wait_for_propagation, Some(false));
            response(DecryptValuesResponse { values: vec![] })
        }
        "DelegatedBatchDecryptValues" => {
            let request = DelegatedBatchDecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.account_address, Some(vec![4; 20]));
            assert_eq!(request.max_concurrency, Some(2.5));
            response(DelegatedBatchDecryptValuesResponse {
                items: vec![generated::BatchItem {
                    encrypted_value: vec![5; 32],
                    contract_address: vec![6; 20],
                    value: None,
                    error: Some(generated::SdkError {
                        code: "RELAYER_REQUEST_FAILED".into(),
                        message: "busy".into(),
                        retryable: true,
                        retry_after_seconds: Some(1.25),
                    }),
                }],
            })
        }
        "DecryptPublicValues" => response(DecryptPublicValuesResponse {
            values: vec![],
            abi_encoded_clear_values: vec![1, 2],
            decryption_proof: vec![3, 4],
        }),
        "RevokePermits" => {
            observed
                .lock()
                .unwrap()
                .push(RevokePermitsRequest::decode(bytes).unwrap().contracts);
            response(Empty {})
        }
        "PreparePermit" => {
            let request = PreparePermitRequest::decode(bytes).unwrap();
            assert_eq!(request.signer_address, vec![7; 20]);
            assert_eq!(request.delegator_address, Some(vec![8; 20]));
            assert_eq!(request.duration_days, Some(0.5));
            response(PreparePermitResponse {
                prepared_permit_json: "{}".into(),
            })
        }
        "UpdateAccount" => {
            assert!(
                UpdateAccountRequest::decode(bytes)
                    .unwrap()
                    .account
                    .is_none()
            );
            response(Empty {})
        }
        "HasPermit" => Response::builder()
            .header("content-type", "application/grpc")
            .header("grpc-status", "14")
            .header("grpc-message", "busy")
            .header("zama-error-code", "RELAYER_REQUEST_FAILED")
            .header("zama-error-retryable", "true")
            .header("zama-error-retry-after-seconds", "1.25")
            .body(Full::new(Bytes::new()).boxed())
            .unwrap(),
        _ => default_handler(path, bytes),
    };
    let server = Server::start(Arc::new(handler)).await;
    let client = Client::connect(&server.socket).await.unwrap();
    let sdk = client
        .create_context(
            &serde_json::json!({ "permitTTL":90 }),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let values = sdk
        .decryption()
        .decrypt_values(&[], Some(0.5))
        .await
        .unwrap();
    assert_eq!(
        values[&B256::ZERO],
        crate::ClearValue::BigInt("340282366920938463463374607431768211457".parse().unwrap())
    );
    assert_eq!(
        values[&B256::repeat_byte(1)],
        crate::ClearValue::Bool(false)
    );
    assert_eq!(
        values[&B256::repeat_byte(2)],
        crate::ClearValue::String("0x1234".into())
    );
    assert_eq!(values[&B256::repeat_byte(3)], crate::ClearValue::Undefined);
    assert_eq!(
        values[&B256::repeat_byte(4)],
        crate::ClearValue::Number(4_294_967_295.0)
    );
    sdk.decryption()
        .delegated_decrypt_values(
            &[],
            Address::repeat_byte(3),
            DelegatedOptions {
                wait_for_propagation: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let items = sdk
        .decryption()
        .delegated_batch_decrypt_values(
            &[],
            Address::repeat_byte(3),
            DelegatedBatchOptions {
                account_address: Some(Address::repeat_byte(4)),
                max_concurrency: Some(2.5),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let error = items[0].result.as_ref().unwrap_err();
    assert!(error.retryable);
    assert_eq!(error.retry_after_seconds, Some(1.25));
    let public = sdk
        .decryption()
        .decrypt_public_values(&[], None)
        .await
        .unwrap();
    assert_eq!(public.decryption_proof, vec![3, 4]);
    assert_eq!(public.abi_encoded_clear_values, vec![1, 2]);
    sdk.permits().revoke_permits(None).await.unwrap();
    sdk.permits().revoke_permits(Some(&[])).await.unwrap();
    assert!(revoked.lock().unwrap()[0].is_none());
    assert!(
        revoked.lock().unwrap()[1]
            .as_ref()
            .unwrap()
            .addresses
            .is_empty()
    );
    sdk.offline()
        .prepare_permit(PreparePermit {
            signer: Address::repeat_byte(7),
            contracts: &[],
            delegator: Some(Address::repeat_byte(8)),
            duration_days: Some(0.5),
        })
        .await
        .unwrap();
    sdk.update_account(None).await.unwrap();
    let error = sdk.permits().has_permit(&[]).await.unwrap_err();
    let error = error.downcast_ref::<RpcError>().unwrap();
    assert_eq!(error.status.code(), tonic::Code::Unavailable);
    assert_eq!(error.sdk.as_ref().unwrap().retry_after_seconds, Some(1.25));
    assert!(error.sdk.as_ref().unwrap().retryable);
    sdk.close().await.unwrap();
    assert!(
        server
            .timeouts
            .lock()
            .unwrap()
            .iter()
            .all(|present| !present)
    );
}

fn action(operation: &str, action: &str) -> SignerServerMessage {
    SignerServerMessage {
        message: Some(signer_server_message::Message::Action(SignerAction {
            operation_id: operation.into(),
            action_id: action.into(),
            account: Some(generated::WalletAccount {
                address: vec![1; 20],
                chain_id: 1,
            }),
            typed_data_json: "{}".into(),
        })),
    }
}
#[tokio::test]
async fn signer_channel_routes_concurrent_callbacks_rejection_and_cancellation() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(&serde_json::json!({}), SignerConfig::Enabled(None))
        .await
        .unwrap();
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (started, mut starts) = mpsc::unbounded_channel();
    let (dropped, mut drops) = mpsc::unbounded_channel();
    struct OnDrop(mpsc::UnboundedSender<()>);
    impl Drop for OnDrop {
        fn drop(&mut self) {
            let _ = self.0.send(());
        }
    }
    let connection = sdk
        .attach_signer(move |request| {
            let started = started.clone();
            let dropped = dropped.clone();
            async move {
                assert_eq!(request.account.address, Address::repeat_byte(1));
                started.send(request.action_id.clone()).unwrap();
                match request.action_id.as_str() {
                    "slow" => {
                        tokio::time::sleep(Duration::from_millis(80)).await;
                        Ok(vec![1])
                    }
                    "reject" => Err(crate::SdkError {
                        code: "SIGNING_FAILED".into(),
                        message: "rejected".into(),
                        retryable: false,
                        retry_after_seconds: None,
                    }),
                    "cancel" => {
                        let _drop = OnDrop(dropped);
                        std::future::pending::<()>().await;
                        unreachable!()
                    }
                    _ => Ok(vec![2]),
                }
            }
        })
        .await
        .unwrap();
    assert!(matches!(
        server.reply().await.message,
        Some(signer_client_message::Message::Attach(_))
    ));
    let a = sdk.operation();
    let b = sdk.operation();
    let c = sdk.operation();
    let d = sdk.operation();
    server
        .actions
        .send(action(&a.message.operation_id, "slow"))
        .unwrap();
    server
        .actions
        .send(action(&b.message.operation_id, "fast"))
        .unwrap();
    for (operation, signature) in [
        (b.message.operation_id.as_str(), vec![2]),
        (a.message.operation_id.as_str(), vec![1]),
    ] {
        let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message
        else {
            panic!("missing reply")
        };
        assert_eq!(reply.operation_id, operation);
        assert_eq!(reply.signature, signature);
    }
    server
        .actions
        .send(action(&b.message.operation_id, "fast"))
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(100), server.replies.recv())
            .await
            .is_err()
    );
    server
        .actions
        .send(action(&c.message.operation_id, "reject"))
        .unwrap();
    let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message else {
        panic!("missing rejection")
    };
    assert_eq!(reply.error.unwrap().code, "SIGNING_FAILED");
    server
        .actions
        .send(action(&d.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Cancelled(
                SignerActionCancelled {
                    operation_id: d.message.operation_id.clone(),
                    action_id: "cancel".into(),
                },
            )),
        })
        .unwrap();
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(100), server.replies.recv())
            .await
            .is_err()
    );
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::ReplyError(
                SignerReplyError {
                    operation_id: d.message.operation_id.clone(),
                    action_id: "cancel".into(),
                    error: Some(generated::SdkError {
                        code: "SIGNER_ACTION_NOT_FOUND".into(),
                        message: "stale".into(),
                        retryable: false,
                        retry_after_seconds: None,
                    }),
                },
            )),
        })
        .unwrap();
    server
        .actions
        .send(action(&d.message.operation_id, "after-stale"))
        .unwrap();
    let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message else {
        panic!("missing reply after stale response")
    };
    assert_eq!(reply.action_id, "after-stale");

    let local = sdk.operation();
    server
        .actions
        .send(action(&local.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    drop(local);
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();

    let closing_operation = sdk.operation();
    server
        .actions
        .send(action(&closing_operation.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    let closing = tokio::spawn(connection.closed());
    tokio::task::yield_now().await;
    closing.abort();
    let _ = closing.await;
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn deadline_covers_stalled_response_body() {
    let server = Server::start(Arc::new(|_, _| {
        Response::builder()
            .header("content-type", "application/grpc")
            .body(
                StreamBody::new(futures_util::stream::pending::<
                    Result<Frame<Bytes>, Infallible>,
                >())
                .boxed(),
            )
            .unwrap()
    }))
    .await;
    let client = Client::connect(&server.socket)
        .await
        .unwrap()
        .with_timeout(Duration::from_millis(100));
    let result = tokio::time::timeout(Duration::from_secs(1), client.sdk_version())
        .await
        .expect("client deadline failed");
    assert!(result.is_err());
    assert_eq!(*server.timeouts.lock().unwrap(), vec![true]);
}

#[path = "storage_tests.rs"]
mod storage_tests;

#[path = "lifecycle_tests.rs"]
mod lifecycle_tests;
