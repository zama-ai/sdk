use crate::{EventContext, EventHandler, Notification, RpcError, SdkError, generated};
use anyhow::{Context, Result, ensure};
use generated::{
    event_client_message::Message as ClientMessage, event_delivery::Payload, event_reply::Outcome,
    event_server_message::Message as ServerMessage,
};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;

const WINDOW: usize = 256;
type Sender = mpsc::Sender<generated::EventClientMessage>;
struct NotificationWorker(tokio::task::JoinHandle<Result<()>>);
impl Drop for NotificationWorker {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub(crate) async fn attach_events(
    mut client: crate::Service,
    context_id: &str,
    handler: Arc<dyn EventHandler>,
) -> Result<crate::channel::Connection> {
    let (sender, mut stream) = crate::channel::attach(
        generated::EventClientMessage {
            message: Some(ClientMessage::Attach(generated::ContextRequest {
                context_id: context_id.into(),
            })),
        },
        |receiver| client.event_channel(receiver),
        |first| matches!(first.message, Some(ServerMessage::Attached(_))),
        "event",
        Duration::from_secs(10),
    )
    .await?;
    let context_id = context_id.to_owned();
    Ok(crate::channel::Connection::spawn(async move {
        let (notifications, receiver) = mpsc::channel(WINDOW);
        let mut worker = NotificationWorker(tokio::spawn(process_notifications(
            receiver,
            handler,
            sender.clone(),
        )));
        let mut callbacks = Notifications {
            context_id,
            notifications,
            sequence: 0,
        };
        loop {
            tokio::select! {
                result = &mut worker.0 => {
                    result.context("notification worker failed")??;
                    return Ok(());
                }
                frame = stream.message() => {
                    let Some(frame) = frame.map_err(RpcError::from)? else { return Ok(()); };
                    callbacks.handle_frame(frame)?;
                }
            }
        }
    }))
}
struct Notifications {
    context_id: String,
    notifications: mpsc::Sender<(EventContext, Option<Notification>)>,
    sequence: u64,
}
impl Notifications {
    fn handle_frame(&mut self, frame: generated::EventServerMessage) -> Result<()> {
        match frame.message {
            Some(ServerMessage::Delivery(delivery)) => self.deliver(delivery),
            Some(ServerMessage::ReplyError(error)) => {
                crate::channel::check_reply_error(error.error, "EVENT_DELIVERY_NOT_FOUND")
            }
            // Prost discards unknown oneof tags, so an empty frame has the same shape.
            None => Ok(()),
            Some(ServerMessage::Attached(_)) => anyhow::bail!("unexpected event attachment"),
        }
    }
    fn deliver(&mut self, delivery: generated::EventDelivery) -> Result<()> {
        ensure!(
            delivery.context_id == self.context_id,
            "event context mismatch"
        );
        ensure!(
            delivery.sequence > self.sequence,
            "event sequence is not increasing"
        );
        self.sequence = delivery.sequence;
        let context = EventContext {
            context_id: delivery.context_id,
            operation_id: (!delivery.operation_id.is_empty()).then_some(delivery.operation_id),
            sequence: delivery.sequence,
        };
        // Prost discards unknown oneof tags, so future payloads also look absent.
        let notification = delivery.payload.map(notification).transpose()?;
        self.notifications
            .try_send((context, notification))
            .map_err(|error| match error {
                TrySendError::Full(_) => anyhow::anyhow!("event notification window exceeded"),
                TrySendError::Closed(_) => anyhow::anyhow!("event notification worker closed"),
            })
    }
}

fn notification(payload: Payload) -> Result<Notification> {
    Ok(match payload {
        Payload::Event(event) => Notification::Lifecycle(Box::new((*event).try_into()?)),
        Payload::WalletAccount(account) => Notification::WalletAccountChanged {
            previous: account.previous.map(TryInto::try_into).transpose()?,
            next: account.next.map(TryInto::try_into).transpose()?,
        },
        Payload::Progress(progress) => Notification::Progress(progress.try_into()?),
    })
}
async fn process_notifications(
    mut receiver: mpsc::Receiver<(EventContext, Option<Notification>)>,
    handler: Arc<dyn EventHandler>,
    sender: Sender,
) -> Result<()> {
    while let Some((context, notification)) = receiver.recv().await {
        let sequence = context.sequence;
        let outcome = match notification {
            Some(notification) => match handler.on_notification(context, notification).await {
                Ok(()) => Outcome::Acknowledged(generated::Empty {}),
                Err(error) => Outcome::Error(callback_error(error).into()),
            },
            None => Outcome::Acknowledged(generated::Empty {}),
        };
        reply(&sender, sequence, outcome).await?;
    }
    Ok(())
}
async fn reply(sender: &Sender, sequence: u64, outcome: Outcome) -> Result<()> {
    sender
        .send(generated::EventClientMessage {
            message: Some(ClientMessage::Reply(generated::EventReply {
                sequence,
                outcome: Some(outcome),
            })),
        })
        .await?;
    Ok(())
}
fn callback_error(error: anyhow::Error) -> SdkError {
    error
        .downcast_ref::<SdkError>()
        .cloned()
        .or_else(|| {
            error
                .downcast_ref::<RpcError>()
                .and_then(|rpc| rpc.sdk.clone())
        })
        .unwrap_or_else(|| SdkError {
            code: "CALLBACK_FAILED".into(),
            message: error.to_string(),
            retryable: false,
            retry_after_seconds: None,
            revert_data: None,
        })
}
