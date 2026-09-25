use super::*;
use crate::{EventContext, EventHandler, Notification};
use prost::Message;
use tokio::sync::Semaphore;

#[derive(Clone, PartialEq, Message)]
struct FutureEventField {
    #[prost(message, optional, tag = "42")]
    value: Option<Empty>,
}

struct HandlerEvents {
    seen: mpsc::UnboundedSender<(EventContext, Notification)>,
    gate: Arc<Semaphore>,
    dropped: Arc<Semaphore>,
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
    ) -> anyhow::Result<()> {
        self.seen.send((context, notification))?;
        let _dropped = Dropped(self.dropped.clone());
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
}
struct PanickingEvents;
#[async_trait]
impl EventHandler for PanickingEvents {
    async fn on_notification(
        &self,
        _context: EventContext,
        _notification: Notification,
    ) -> anyhow::Result<()> {
        panic!("event handler failed")
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
fn future_delivery(sequence: u64) -> EventServerMessage {
    let mut encoded = EventDelivery {
        context_id: "context".into(),
        operation_id: "operation".into(),
        sequence,
        payload: None,
    }
    .encode_to_vec();
    encoded.extend(
        FutureEventField {
            value: Some(Empty {}),
        }
        .encode_to_vec(),
    );
    let delivery = EventDelivery::decode(encoded.as_slice()).unwrap();
    assert!(delivery.payload.is_none());
    EventServerMessage {
        message: Some(event_server_message::Message::Delivery(delivery)),
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
async fn events_preserve_order_ack_after_handler_and_unknown_kinds() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (seen, mut observations) = mpsc::unbounded_channel();
    let gate = Arc::new(Semaphore::new(0));
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate: gate.clone(),
            dropped: Arc::new(Semaphore::new(0)),
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
    gate.add_permits(1);
    let ack = next_reply(&mut server).await;
    assert_eq!(ack.sequence, 1);
    assert!(
        matches!(ack.outcome, Some(event_reply::Outcome::Error(error)) if error.code == "OBSERVER_ERROR")
    );
    assert_eq!(observations.recv().await.unwrap().0.sequence, 2);
    gate.add_permits(1);
    assert_eq!(next_reply(&mut server).await.sequence, 2);
    server
        .event_actions
        .send(delivery(
            3,
            event_delivery::Payload::Progress(generated::OperationProgress {
                kind: 100,
                tx_hash: None,
            }),
        ))
        .unwrap();
    let (_, notification) = observations.recv().await.unwrap();
    assert!(
        matches!(notification, Notification::Progress(progress) if progress.kind == crate::EventEnum::Unknown(100) && progress.tx_hash.is_none())
    );
    gate.add_permits(1);
    assert_eq!(next_reply(&mut server).await.sequence, 3);
    server
        .event_actions
        .send(delivery(
            4,
            event_delivery::Payload::Event(Box::new(generated::SdkEvent {
                r#type: 100,
                operation: Some(101),
                ..Default::default()
            })),
        ))
        .unwrap();
    let (_, notification) = observations.recv().await.unwrap();
    assert!(
        matches!(notification, Notification::Lifecycle(event) if event.kind == crate::EventKind::Unknown(100) && event.operation == Some(crate::EventEnum::Unknown(101)))
    );
    gate.add_permits(1);
    assert_eq!(next_reply(&mut server).await.sequence, 4);
    server
        .event_actions
        .send(delivery(
            5,
            event_delivery::Payload::Event(Box::new(generated::SdkEvent {
                r#type: generated::SdkEventKind::EncryptEnd as i32,
                ..Default::default()
            })),
        ))
        .unwrap();
    let (_, notification) = observations.recv().await.unwrap();
    assert!(
        matches!(notification, Notification::Lifecycle(event) if event.kind == crate::EventKind::Known(crate::SdkEventKind::EncryptEnd))
    );
    gate.add_permits(1);
    assert_eq!(next_reply(&mut server).await.sequence, 5);
    sdk.close().await.unwrap();
    assert!(
        sdk.wait_channel_closed(CallbackChannel::Events)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn future_delivery_payload_and_frame_are_skipped_before_next_event() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (seen, mut observed) = mpsc::unbounded_channel();
    let gate = Arc::new(Semaphore::new(1));
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate,
            dropped: Arc::new(Semaphore::new(0)),
        })
        .build()
        .await
        .unwrap();
    server.event_replies.recv().await.unwrap();
    let future_frame = EventServerMessage::decode(
        FutureEventField {
            value: Some(Empty {}),
        }
        .encode_to_vec()
        .as_slice(),
    )
    .unwrap();
    assert!(future_frame.message.is_none());
    server.event_actions.send(future_frame).unwrap();
    server.event_actions.send(future_delivery(1)).unwrap();
    let skipped = next_reply(&mut server).await;
    assert_eq!(skipped.sequence, 1);
    assert!(matches!(
        skipped.outcome,
        Some(event_reply::Outcome::Acknowledged(_))
    ));
    assert!(observed.try_recv().is_err());
    server
        .event_actions
        .send(delivery(
            2,
            event_delivery::Payload::Progress(generated::OperationProgress {
                kind: generated::ProgressKind::EncryptComplete as i32,
                tx_hash: None,
            }),
        ))
        .unwrap();
    let (context, notification) = observed.recv().await.unwrap();
    assert_eq!(context.sequence, 2);
    assert!(
        matches!(notification, Notification::Progress(progress) if progress.kind == crate::EventEnum::Known(crate::ProgressKind::EncryptComplete))
    );
    assert_eq!(next_reply(&mut server).await.sequence, 2);
    sdk.close().await.unwrap();
}

#[test]
fn lifecycle_payload_preserves_clear_values_and_errors() {
    let wire = generated::SdkEvent {
        r#type: generated::SdkEventKind::DecryptEnd as i32,
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
        operation: Some(generated::EventOperation::GrantPermit as i32),
        shield_path: Some(generated::ShieldPath::TransferAndCall as i32),
        step: Some(generated::ApprovalStep::Reset as i32),
        ..Default::default()
    };
    let event = crate::SdkEvent::try_from(wire).unwrap();
    assert_eq!(
        event.kind,
        crate::EventKind::Known(crate::SdkEventKind::DecryptEnd)
    );
    assert_eq!(event.kind.to_string(), "SDK_EVENT_KIND_DECRYPT_END");
    assert_eq!(event.timestamp, 1.5);
    assert_eq!(event.duration_ms, Some(2.5));
    assert_eq!(
        event.result[&B256::repeat_byte(2)],
        crate::ClearValue::BigInt("123456789012345678901234567890".parse().unwrap())
    );
    assert_eq!(event.error.unwrap().retry_after_seconds, Some(1));
    assert_eq!(event.sdk_operation_id.as_deref(), Some("sdk-op"));
    assert_eq!(
        event.operation,
        Some(crate::EventEnum::Known(crate::EventOperation::GrantPermit))
    );
    assert_eq!(
        event.shield_path,
        Some(crate::EventEnum::Known(crate::ShieldPath::TransferAndCall))
    );
    assert_eq!(
        event.step,
        Some(crate::EventEnum::Known(crate::ApprovalStep::Reset))
    );
    let progress = crate::OperationProgress::try_from(generated::OperationProgress {
        kind: generated::ProgressKind::TransferSubmitted as i32,
        tx_hash: None,
    })
    .unwrap();
    assert_eq!(
        progress.kind,
        crate::EventEnum::Known(crate::ProgressKind::TransferSubmitted)
    );
    assert_eq!(progress.tx_hash, None);
    let unspecified = crate::OperationProgress::try_from(generated::OperationProgress {
        kind: generated::ProgressKind::Unspecified as i32,
        tx_hash: None,
    })
    .unwrap();
    assert_eq!(
        unspecified.kind,
        crate::EventEnum::Known(crate::ProgressKind::Unspecified)
    );
    assert!(
        crate::OperationProgress::try_from(generated::OperationProgress {
            kind: 100,
            tx_hash: Some(vec![1]),
        })
        .is_err()
    );
    let unknown = crate::SdkEvent::try_from(generated::SdkEvent {
        r#type: 100,
        operation: Some(101),
        shield_path: Some(102),
        step: Some(103),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(unknown.kind, crate::EventKind::Unknown(100));
    assert_eq!(unknown.kind.to_string(), "Unknown(100)");
    assert_eq!(unknown.operation, Some(crate::EventEnum::Unknown(101)));
    assert_eq!(unknown.operation.unwrap().to_string(), "Unknown(101)");
    assert_eq!(unknown.shield_path, Some(crate::EventEnum::Unknown(102)));
    assert_eq!(unknown.step, Some(crate::EventEnum::Unknown(103)));
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
            dropped: Arc::new(Semaphore::new(0)),
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
    assert_eq!(failure.kind(), crate::ErrorKind::Protocol);
    assert!(failure.to_string().contains("sequence"));
    assert_eq!(observed.recv().await.unwrap().0.sequence, 10);
    assert!(observed.recv().await.is_none());
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn mismatched_event_context_closes_channel_without_delivery() {
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
            gate: Arc::new(Semaphore::new(1)),
            dropped: Arc::new(Semaphore::new(0)),
        })
        .build()
        .await
        .unwrap();
    server.event_replies.recv().await.unwrap();
    let mut wrong = future_delivery(1);
    if let Some(event_server_message::Message::Delivery(delivery)) = &mut wrong.message {
        delivery.context_id = "other-context".into();
    }
    server.event_actions.send(wrong).unwrap();
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        sdk.wait_channel_closed(CallbackChannel::Events),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert_eq!(error.kind(), crate::ErrorKind::Protocol);
    assert!(error.to_string().contains("context mismatch"));
    assert!(observed.recv().await.is_none());
    sdk.close().await.unwrap();
}

async fn blocking_events() -> (
    Server,
    Sdk,
    mpsc::UnboundedReceiver<(EventContext, Notification)>,
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
    let dropped = Arc::new(Semaphore::new(0));
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(HandlerEvents {
            seen,
            gate: Arc::new(Semaphore::new(0)),
            dropped: dropped.clone(),
        })
        .build()
        .await
        .unwrap();
    (server, sdk, observations, dropped)
}

#[tokio::test]
async fn event_notification_overflow_closes_channel_and_discards_queued_handlers() {
    let (server, sdk, mut observations, _) = blocking_events().await;
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

async fn start_blocked_notification(
    server: &Server,
    observations: &mut mpsc::UnboundedReceiver<(EventContext, Notification)>,
) {
    server
        .event_actions
        .send(delivery(
            1,
            event_delivery::Payload::Progress(generated::OperationProgress {
                kind: 1,
                tx_hash: None,
            }),
        ))
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), observations.recv())
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn event_channel_eof_drops_active_notification() {
    let (mut server, sdk, mut observations, dropped) = blocking_events().await;
    start_blocked_notification(&server, &mut observations).await;
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
async fn sdk_close_drops_active_notification() {
    let (server, sdk, mut observations, dropped) = blocking_events().await;
    start_blocked_notification(&server, &mut observations).await;
    sdk.close().await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), dropped.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
}

#[tokio::test]
async fn panicking_event_handler_terminates_subscription() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .event_actions
        .send(EventServerMessage {
            message: Some(event_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .events(PanickingEvents)
        .build()
        .await
        .unwrap();
    server.event_replies.recv().await.unwrap();
    server
        .event_actions
        .send(delivery(
            1,
            event_delivery::Payload::Progress(generated::OperationProgress {
                kind: generated::ProgressKind::EncryptComplete as i32,
                tx_hash: None,
            }),
        ))
        .unwrap();
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        sdk.wait_channel_closed(CallbackChannel::Events),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert_eq!(error.kind(), crate::ErrorKind::Callback);
    assert!(error.to_string().contains("notification worker failed"));
    assert!(server.event_replies.try_recv().is_err());
    sdk.close().await.unwrap();
}
