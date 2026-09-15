use super::*;
use crate::{EventContext, EventHandler, Notification};
use tokio::sync::Semaphore;

struct HandlerEvents {
    seen: mpsc::UnboundedSender<(EventContext, Notification)>,
    gate: Arc<Semaphore>,
    batch_started: Arc<Semaphore>,
    batch_dropped: Arc<Semaphore>,
}
struct Dropped(Arc<Semaphore>);
impl Drop for Dropped {
    fn drop(&mut self) {
        self.0.add_permits(1);
    }
}
#[async_trait]
impl EventHandler for HandlerEvents {
    async fn on_notification(
        &self,
        context: EventContext,
        notification: Notification,
    ) -> Result<()> {
        self.seen.send((context, notification))?;
        self.gate.acquire().await?.forget();
        Err(crate::SdkError {
            code: "OBSERVER_ERROR".into(),
            message: "observer".into(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        }
        .into())
    }
    async fn on_batch_error(
        &self,
        context: EventContext,
        _callback: crate::BatchErrorCallback,
    ) -> Result<BigInt> {
        if context.sequence == 5 {
            return Err(crate::SdkError {
                code: "BATCH_POLICY".into(),
                message: "policy".into(),
                retryable: true,
                retry_after_seconds: Some(3),
                revert_data: None,
            }
            .into());
        }
        if context.sequence == 3 {
            let _dropped = Dropped(self.batch_dropped.clone());
            self.batch_started.add_permits(1);
            std::future::pending::<()>().await;
        }
        Ok("123456789012345678901234567890".parse()?)
    }
}
fn delivery(sequence: u64, payload: event_delivery::Payload) -> EventServerMessage {
    EventServerMessage {
        message: Some(event_server_message::Message::Delivery(EventDelivery {
            context_id: "context".into(),
            operation_id: "operation".into(),
            sequence,
            payload: Some(payload),
        })),
    }
}
async fn next_reply(server: &mut Server) -> EventReply {
    let message = tokio::time::timeout(Duration::from_secs(2), server.event_replies.recv())
        .await
        .unwrap()
        .unwrap();
    let Some(event_client_message::Message::Reply(reply)) = message.message else {
        panic!("expected reply")
    };
    reply
}
#[tokio::test]
async fn events_preserve_order_ack_after_handler_and_cancel_batch_while_notification_blocks() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (seen, mut observations) = mpsc::unbounded_channel();
    let gate = Arc::new(Semaphore::new(0));
    let started = Arc::new(Semaphore::new(0));
    let dropped = Arc::new(Semaphore::new(0));
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate: gate.clone(),
            batch_started: started.clone(),
            batch_dropped: dropped.clone(),
        })
        .build()
        .await
        .unwrap();
    assert!(matches!(
        server.event_replies.recv().await.unwrap().message,
        Some(event_client_message::Message::Attach(_))
    ));
    for sequence in 1..=2 {
        server
            .event_actions
            .send(delivery(
                sequence,
                event_delivery::Payload::WalletAccount(WalletAccountChanged {
                    previous: None,
                    next: Some(generated::WalletAccount {
                        address: vec![sequence as u8; 20],
                        chain_id: 11155111,
                    }),
                }),
            ))
            .unwrap();
    }
    let first = observations.recv().await.unwrap();
    assert_eq!(first.0.sequence, 1);
    assert_eq!(first.0.operation_id.as_deref(), Some("operation"));
    assert!(server.event_replies.try_recv().is_err());
    assert!(observations.try_recv().is_err());
    let batch = || {
        event_delivery::Payload::BatchError(generated::BatchErrorCallback {
            token_address: vec![1; 20],
            error: Some(generated::SdkError {
                code: "FAILED".into(),
                ..Default::default()
            }),
        })
    };
    server.event_actions.send(delivery(3, batch())).unwrap();
    tokio::time::timeout(Duration::from_secs(2), started.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Cancelled(EventCancelled {
                sequence: 3,
            })),
        })
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), dropped.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    server.event_actions.send(delivery(4, batch())).unwrap();
    let fallback = next_reply(&mut server).await;
    assert_eq!(fallback.sequence, 4);
    assert_eq!(
        fallback.outcome,
        Some(event_reply::Outcome::FallbackBigint(
            "123456789012345678901234567890".into()
        ))
    );
    server.event_actions.send(delivery(5, batch())).unwrap();
    let failure = next_reply(&mut server).await;
    assert_eq!(failure.sequence, 5);
    assert!(
        matches!(failure.outcome, Some(event_reply::Outcome::Error(error)) if error.code == "BATCH_POLICY" && error.retry_after_seconds == Some(3))
    );
    gate.add_permits(1);
    let ack = next_reply(&mut server).await;
    assert_eq!(ack.sequence, 1);
    assert!(
        matches!(ack.outcome, Some(event_reply::Outcome::Error(error)) if error.code == "OBSERVER_ERROR")
    );
    assert_eq!(observations.recv().await.unwrap().0.sequence, 2);
    gate.add_permits(1);
    assert_eq!(next_reply(&mut server).await.sequence, 2);
    sdk.close().await.unwrap();
    assert!(
        sdk.wait_channel_closed(CallbackChannel::Events)
            .await
            .is_err()
    );
}

#[test]
fn lifecycle_payload_preserves_clear_values_and_errors() {
    let wire = generated::SdkEvent {
        r#type: "decrypt:end".into(),
        timestamp: 1.5,
        sdk_operation_id: Some("sdk-op".into()),
        duration_ms: Some(2.5),
        token_address: Some(vec![1; 20]),
        encrypted_values: vec![vec![2; 32]],
        result: vec![ClearEntry {
            encrypted_value: vec![2; 32],
            value: Some(generated::ClearValue {
                value: Some(clear_value::Value::BigintValue(
                    "123456789012345678901234567890".into(),
                )),
            }),
        }],
        error: Some(generated::SdkError {
            code: "FAILED".into(),
            message: "failure".into(),
            retryable: true,
            retry_after_seconds: Some(1),
        }),
        ..Default::default()
    };
    let event = crate::SdkEvent::try_from(wire).unwrap();
    assert_eq!(event.kind, crate::EventKind::DecryptEnd);
    assert_eq!(event.timestamp, 1.5);
    assert_eq!(event.duration_ms, Some(2.5));
    assert_eq!(
        event.result[&B256::repeat_byte(2)],
        crate::ClearValue::BigInt("123456789012345678901234567890".parse().unwrap())
    );
    assert_eq!(event.error.unwrap().retry_after_seconds, Some(1));
    assert_eq!(event.sdk_operation_id.as_deref(), Some("sdk-op"));
    assert!(
        crate::OperationProgress::try_from(generated::OperationProgress {
            kind: 2,
            tx_hash: None
        })
        .is_err()
    );
    assert!(crate::EventKind::try_from("future:event").is_err());
}

#[tokio::test]
async fn malformed_event_sequence_closes_channel_without_replay() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (seen, mut observed) = mpsc::unbounded_channel();
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate: Arc::new(Semaphore::new(2)),
            batch_started: Arc::new(Semaphore::new(0)),
            batch_dropped: Arc::new(Semaphore::new(0)),
        })
        .build()
        .await
        .unwrap();
    server.event_replies.recv().await.unwrap();
    let frame = delivery(
        10,
        event_delivery::Payload::Progress(generated::OperationProgress {
            kind: 1,
            tx_hash: None,
        }),
    );
    server.event_actions.send(frame.clone()).unwrap();
    assert_eq!(next_reply(&mut server).await.sequence, 10);
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::ReplyError(EventReplyError {
                sequence: 10,
                error: Some(generated::SdkError {
                    code: "EVENT_DELIVERY_NOT_FOUND".into(),
                    ..Default::default()
                }),
            })),
        })
        .unwrap();
    server.event_actions.send(frame).unwrap();
    let failure = tokio::time::timeout(
        Duration::from_secs(2),
        sdk.wait_channel_closed(CallbackChannel::Events),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(failure.to_string().contains("sequence"));
    assert_eq!(observed.recv().await.unwrap().0.sequence, 10);
    assert!(observed.recv().await.is_none());
    sdk.close().await.unwrap();
}

async fn blocking_events() -> (
    Server,
    Sdk,
    mpsc::UnboundedReceiver<(EventContext, Notification)>,
    Arc<Semaphore>,
    Arc<Semaphore>,
) {
    let server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (seen, observations) = mpsc::unbounded_channel();
    let started = Arc::new(Semaphore::new(0));
    let dropped = Arc::new(Semaphore::new(0));
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate: Arc::new(Semaphore::new(0)),
            batch_started: started.clone(),
            batch_dropped: dropped.clone(),
        })
        .build()
        .await
        .unwrap();
    (server, sdk, observations, started, dropped)
}

#[tokio::test]
async fn event_notification_overflow_closes_channel_and_discards_queued_handlers() {
    let (server, sdk, mut observations, _, _) = blocking_events().await;
    let notification = |sequence| {
        delivery(
            sequence,
            event_delivery::Payload::Progress(generated::OperationProgress {
                kind: 1,
                tx_hash: None,
            }),
        )
    };
    server.event_actions.send(notification(1)).unwrap();
    assert_eq!(observations.recv().await.unwrap().0.sequence, 1);
    for sequence in 2..=258 {
        server.event_actions.send(notification(sequence)).unwrap();
    }
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        sdk.wait_channel_closed(CallbackChannel::Events),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(error.to_string().contains("window exceeded"));
    assert!(
        tokio::time::timeout(Duration::from_secs(2), observations.recv())
            .await
            .unwrap()
            .is_none()
    );
    sdk.close().await.unwrap();
}

async fn start_blocked_batch(server: &Server, started: &Semaphore) {
    server
        .event_actions
        .send(delivery(
            3,
            event_delivery::Payload::BatchError(generated::BatchErrorCallback {
                token_address: vec![1; 20],
                error: Some(generated::SdkError {
                    code: "FAILED".into(),
                    ..Default::default()
                }),
            }),
        ))
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), started.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
}

#[tokio::test]
async fn event_channel_eof_drops_active_batch_future() {
    let (mut server, sdk, _, started, dropped) = blocking_events().await;
    start_blocked_batch(&server, &started).await;
    let (replacement, _) = mpsc::unbounded_channel();
    drop(std::mem::replace(&mut server.event_actions, replacement));
    let _ = tokio::time::timeout(
        Duration::from_secs(2),
        sdk.wait_channel_closed(CallbackChannel::Events),
    )
    .await
    .unwrap();
    tokio::time::timeout(Duration::from_secs(2), dropped.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn sdk_close_drops_active_batch_future() {
    let (server, sdk, _, started, dropped) = blocking_events().await;
    start_blocked_batch(&server, &started).await;
    sdk.close().await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), dropped.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
}
