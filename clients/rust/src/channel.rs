use crate::{RpcError, SdkError, generated};
use anyhow::{Context, Result, ensure};
use std::{future::Future, time::Duration};
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
};
use tokio_stream::wrappers::ReceiverStream;

#[derive(Clone)]
enum Failure {
    Sdk(SdkError),
    Rpc(RpcError),
    Other(String),
}
impl From<anyhow::Error> for Failure {
    fn from(error: anyhow::Error) -> Self {
        if let Some(sdk) = error.downcast_ref::<SdkError>() {
            Self::Sdk(sdk.clone())
        } else if let Some(rpc) = error.downcast_ref::<RpcError>() {
            Self::Rpc(rpc.clone())
        } else {
            Self::Other(format!("{error:#}"))
        }
    }
}
impl Failure {
    fn into_error(self) -> anyhow::Error {
        match self {
            Self::Sdk(error) => error.into(),
            Self::Rpc(error) => error.into(),
            Self::Other(message) => anyhow::Error::msg(message),
        }
    }
}

pub(crate) struct Connection {
    task: JoinHandle<()>,
    outcome: watch::Receiver<Option<Result<(), Failure>>>,
}
impl Connection {
    pub fn spawn(task: impl Future<Output = Result<()>> + Send + 'static) -> Self {
        let (sender, outcome) = watch::channel(None);
        let task = tokio::spawn(async move {
            sender.send_replace(Some(task.await.map_err(Failure::from)));
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
                return result.map_err(Failure::into_error);
            }
            outcome
                .changed()
                .await
                .context("callback channel task stopped")?;
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
    F: Future<Output = Result<tonic::Response<tonic::Streaming<R>>, tonic::Status>>,
{
    let (sender, receiver) = mpsc::channel(32);
    sender
        .send(message)
        .await
        .map_err(|_| anyhow::anyhow!("{label} attachment queue closed"))?;
    let mut stream = tokio::time::timeout(timeout, open(ReceiverStream::new(receiver)))
        .await
        .with_context(|| format!("{label} attachment timed out"))?
        .map_err(RpcError::from)?
        .into_inner();
    let first = tokio::time::timeout(timeout, stream.message())
        .await
        .with_context(|| format!("{label} attachment acknowledgment timed out"))?
        .map_err(RpcError::from)?
        .with_context(|| format!("{label} channel closed before attachment"))?;
    ensure!(
        attached(&first),
        "missing {label} attachment acknowledgment"
    );
    Ok((sender, stream))
}

pub(crate) fn check_reply_error(
    error: Option<generated::SdkError>,
    stale_code: &str,
) -> Result<()> {
    let error = error.context("missing callback reply error")?;
    // Cancellation can retire a request before its callback reply arrives.
    if error.code == stale_code {
        return Ok(());
    }
    Err(SdkError::from(error).into())
}
