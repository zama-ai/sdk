use crate::{ClientError, Result, SdkError, generated};
use std::{future::Future, time::Duration};
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
};
use tokio_stream::wrappers::ReceiverStream;

pub(crate) struct Connection {
    task: JoinHandle<()>,
    outcome: watch::Receiver<Option<Result<()>>>,
}
impl Connection {
    pub fn spawn(task: impl Future<Output = Result<()>> + Send + 'static) -> Self {
        let (sender, outcome) = watch::channel(None);
        let task = tokio::spawn(async move {
            sender.send_replace(Some(task.await));
        });
        Self { task, outcome }
    }
    pub fn abort(&self) {
        self.task.abort();
    }
    pub async fn wait(&self) -> Result<()> {
        let mut outcome = self.outcome.clone();
        loop {
            if let Some(result) = outcome.borrow_and_update().clone() {
                return result;
            }
            outcome
                .changed()
                .await
                .map_err(|_| ClientError::closed("callback channel task stopped"))?;
        }
    }
    #[cfg(test)]
    pub async fn closed(self) -> Result<()> {
        self.wait().await
    }
}
impl Drop for Connection {
    fn drop(&mut self) {
        self.abort();
    }
}

pub(crate) async fn attach<T, R, F>(
    message: T,
    open: impl FnOnce(ReceiverStream<T>) -> F,
    attached: impl FnOnce(&R) -> bool,
    label: &str,
    timeout: Duration,
) -> Result<(mpsc::Sender<T>, tonic::Streaming<R>)>
where
    T: Send + 'static,
    F: Future<Output = std::result::Result<tonic::Response<tonic::Streaming<R>>, tonic::Status>>,
{
    let (sender, receiver) = mpsc::channel(32);
    sender
        .send(message)
        .await
        .map_err(|_| ClientError::closed(format!("{label} attachment queue closed")))?;
    let mut stream = tokio::time::timeout(timeout, open(ReceiverStream::new(receiver)))
        .await
        .map_err(|_| ClientError::timeout(format!("{label} attachment timed out")))??
        .into_inner();
    let first = tokio::time::timeout(timeout, stream.message())
        .await
        .map_err(|_| ClientError::timeout(format!("{label} attachment acknowledgment timed out")))??
        .ok_or_else(|| {
            ClientError::protocol(format!("{label} channel closed before attachment"))
        })?;
    if !attached(&first) {
        return Err(ClientError::protocol(format!(
            "missing {label} attachment acknowledgment"
        )));
    }
    Ok((sender, stream))
}

pub(crate) fn check_reply_error(
    error: Option<generated::SdkError>,
    stale_code: &str,
) -> Result<()> {
    let error = error.ok_or_else(|| ClientError::protocol("missing callback reply error"))?;
    // Cancellation can retire a request before its callback reply arrives.
    if error.code == stale_code {
        return Ok(());
    }
    Err(SdkError::from(error).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connection_reports_the_task_error() {
        let sdk = SdkError::signing_rejected("no");
        let error =
            Connection::spawn(async { Err(ClientError::from(SdkError::signing_rejected("no"))) })
                .closed()
                .await
                .unwrap_err();
        assert_eq!(error.kind(), crate::ErrorKind::Sdk);
        assert_eq!(error.sdk_error(), Some(&sdk));
    }

    #[tokio::test]
    async fn wait_reports_closed_when_the_task_is_dropped() {
        let connection = Connection::spawn(std::future::pending());
        connection.abort();
        let error = connection.wait().await.unwrap_err();
        assert_eq!(error.kind(), crate::ErrorKind::Closed);
    }

    #[tokio::test]
    async fn attach_times_out_when_the_stream_never_opens() {
        let result = attach(
            generated::Empty {},
            |_| {
                std::future::pending::<
                    std::result::Result<
                        tonic::Response<tonic::Streaming<generated::Empty>>,
                        tonic::Status,
                    >,
                >()
            },
            |_| true,
            "test",
            Duration::from_millis(10),
        )
        .await;
        let error = result.err().unwrap();
        assert_eq!(error.kind(), crate::ErrorKind::Timeout);
        assert_eq!(error.to_string(), "test attachment timed out");
    }
}
