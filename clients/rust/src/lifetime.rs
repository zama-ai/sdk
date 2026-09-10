use crate::{Service, channel::Connection, generated, unary};
use anyhow::Result;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tokio::sync::Mutex;

pub(crate) struct Resources {
    client: Service,
    context_id: String,
    closed: AtomicBool,
    closing: Mutex<()>,
    pub signer: Option<Connection>,
    pub storage: Option<Connection>,
}
impl Resources {
    pub fn new(
        client: Service,
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
        }
    }
    pub async fn close(&self, timeout: Option<Duration>) -> Result<()> {
        let _closing = self.closing.lock().await;
        if self.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        let mut client = self.client.clone();
        let result = unary(
            generated::ContextRequest {
                context_id: self.context_id.clone(),
            },
            timeout,
            |request| client.close_context(request),
        )
        .await;
        if result.is_ok() {
            self.closed.store(true, Ordering::Release);
        }
        for connection in self.signer.iter().chain(self.storage.iter()) {
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
            let mut client = self.client.clone();
            let context_id = self.context_id.clone();
            let signer = self.signer.take();
            let storage = self.storage.take();
            runtime.spawn(async move {
                let _ = tokio::time::timeout(
                    Duration::from_secs(5),
                    client.close_context(generated::ContextRequest { context_id }),
                )
                .await;
                drop(signer);
                drop(storage);
            });
        }
    }
}
