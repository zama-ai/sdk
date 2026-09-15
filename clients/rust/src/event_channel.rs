use crate::{EventContext, EventHandler, Notification, RpcError, SdkError, generated};
use anyhow::{Context, Result, ensure};
use generated::{
    event_client_message::Message as ClientMessage, event_delivery::Payload, event_reply::Outcome,
    event_server_message::Message as ServerMessage,
};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::{sync::mpsc, task::JoinSet};

const WINDOW: usize = 256;
type Sender = mpsc::Sender<generated::EventClientMessage>;

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
        let mut worker = JoinSet::new();
        worker.spawn(process_notifications(
            receiver,
            handler.clone(),
            sender.clone(),
        ));
        let mut callbacks = Callbacks {
            context_id,
            handler,
            sender,
            notifications,
            tasks: JoinSet::new(),
            pending: HashMap::new(),
            sequence: 0,
        };
        loop {
            tokio::select! {
                result = worker.join_next() => {
                    result.context("missing notification worker")???;
                    return Ok(());
                }
                result = callbacks.tasks.join_next(), if !callbacks.tasks.is_empty() => {
                    match result.context("missing event callback")? {
                        Ok(result) => { callbacks.pending.remove(&result?); },
                        Err(error) if error.is_cancelled() => {},
                        Err(error) => return Err(error.into()),
                    }
                }
                frame = stream.message() => {
                    let Some(frame) = frame.map_err(RpcError::from)? else { return Ok(()); };
                    callbacks.handle_frame(frame)?;
                }
            }
        }
    }))
}
struct Callbacks {
    context_id: String,
    handler: Arc<dyn EventHandler>,
    sender: Sender,
    notifications: mpsc::Sender<(EventContext, Notification)>,
    tasks: JoinSet<Result<u64>>,
    pending: HashMap<u64, tokio::task::AbortHandle>,
    sequence: u64,
}
impl Callbacks {
    fn handle_frame(&mut self, frame: generated::EventServerMessage) -> Result<()> {
        match frame.message {
            Some(ServerMessage::Delivery(delivery)) => self.deliver(delivery),
            Some(ServerMessage::Cancelled(cancelled)) => {
                if let Some(task) = self.pending.remove(&cancelled.sequence) {
                    task.abort();
                }
                Ok(())
            }
            Some(ServerMessage::ReplyError(error)) => {
                crate::channel::check_reply_error(error.error, "EVENT_DELIVERY_NOT_FOUND")
            }
            _ => anyhow::bail!("unexpected event channel frame"),
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
        match delivery.payload.context("missing event payload")? {
            Payload::BatchError(callback) => self.batch(context, callback),
            payload => self
                .notifications
                .try_send((context, notification(payload)?))
                .map_err(|_| anyhow::anyhow!("event notification window exceeded")),
        }
    }
    fn batch(
        &mut self,
        context: EventContext,
        callback: generated::BatchErrorCallback,
    ) -> Result<()> {
        ensure!(
            self.pending.len() < WINDOW,
            "event callback window exceeded"
        );
        let callback = crate::BatchErrorCallback {
            token_address: crate::events::address(&callback.token_address)?,
            error: callback
                .error
                .context("missing batch callback error")?
                .into(),
        };
        let handler = self.handler.clone();
        let sender = self.sender.clone();
        let sequence = context.sequence;
        let task = self.tasks.spawn(async move {
            let outcome = match handler.on_batch_error(context, callback).await {
                Ok(value) => Outcome::FallbackBigint(value.to_string()),
                Err(error) => Outcome::Error(callback_error(error).into()),
            };
            reply(&sender, sequence, outcome).await?;
            Ok(sequence)
        });
        self.pending.insert(sequence, task);
        Ok(())
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
        Payload::BatchError(_) => anyhow::bail!("batch callback is not a notification"),
    })
}
async fn process_notifications(
    mut receiver: mpsc::Receiver<(EventContext, Notification)>,
    handler: Arc<dyn EventHandler>,
    sender: Sender,
) -> Result<()> {
    while let Some((context, notification)) = receiver.recv().await {
        let sequence = context.sequence;
        let outcome = match handler.on_notification(context, notification).await {
            Ok(()) => Outcome::Acknowledged(generated::Empty {}),
            Err(error) => Outcome::Error(callback_error(error).into()),
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
