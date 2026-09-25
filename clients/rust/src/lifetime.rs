use crate::{Client, Result, channel::Connection, generated};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tokio::sync::Mutex;

pub(crate) struct Resources {
    client: Client,
    context_id: String,
    closed: AtomicBool,
    closing: Mutex<()>,
    pub signer: Option<Connection>,
    pub storage: Option<Connection>,
    pub events: Option<Connection>,
}
impl Resources {
    pub fn new(
        client: Client,
        context_id: String,
        signer: Option<Connection>,
        storage: Option<Connection>,
    ) -> Self {
        Self {
            client,
            context_id,
            closed: AtomicBool::new(false),
            closing: Mutex::new(()),
            signer,
            storage,
            events: None,
        }
    }
    pub async fn close(&self, client: &Client) -> Result<()> {
        let _closing = self.closing.lock().await;
        if self.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        let result = client
            .unary(
                generated::ContextRequest {
                    context_id: self.context_id.clone(),
                },
                |mut client, request| async move { client.close_context(request).await },
            )
            .await;
        if result.is_ok() {
            self.closed.store(true, Ordering::Release);
        }
        for connection in self
            .signer
            .iter()
            .chain(self.storage.iter())
            .chain(self.events.iter())
        {
            connection.abort();
        }
        result?;
        Ok(())
    }
}
impl Drop for Resources {
    fn drop(&mut self) {
        if self.closed.load(Ordering::Acquire) {
            return;
        }
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let client = self.client.clone().with_timeout(Duration::from_secs(5));
            let context_id = self.context_id.clone();
            let signer = self.signer.take();
            let storage = self.storage.take();
            let events = self.events.take();
            runtime.spawn(async move {
                let _ = client
                    .unary(
                        generated::ContextRequest { context_id },
                        |mut client, request| async move { client.close_context(request).await },
                    )
                    .await;
                drop(signer);
                drop(storage);
                drop(events);
            });
        }
    }
}
