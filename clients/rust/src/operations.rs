use crate::{Result, generated};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::broadcast;

pub(crate) struct Operations {
    sequence: AtomicU64,
    // Per operation, contract writes dispatched to the wallet adapter and not reported as reverted.
    active: Mutex<HashMap<String, usize>>,
    pub cancelled: broadcast::Sender<String>,
}
impl Operations {
    pub fn new() -> Self {
        Self {
            sequence: AtomicU64::new(1),
            active: Mutex::new(HashMap::new()),
            cancelled: broadcast::channel(128).0,
        }
    }
    pub fn contains(&self, id: &str) -> bool {
        self.active.lock().unwrap().contains_key(id)
    }
    pub fn write_dispatched(&self, id: &str) {
        if let Some(writes) = self.active.lock().unwrap().get_mut(id) {
            *writes += 1;
        }
    }
    pub fn write_reverted(&self, id: &str) {
        if let Some(writes) = self.active.lock().unwrap().get_mut(id) {
            *writes = writes.saturating_sub(1);
        }
    }
    pub fn start(self: &Arc<Self>, context_id: &str) -> OperationGuard {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        self.active.lock().unwrap().insert(id.clone(), 0);
        OperationGuard {
            state: self.clone(),
            message: generated::Operation {
                context_id: context_id.into(),
                operation_id: id,
            },
        }
    }
}
pub(crate) struct OperationGuard {
    state: Arc<Operations>,
    pub message: generated::Operation,
}
impl OperationGuard {
    /// Without a daemon verdict, a failure after a dispatched write may hide a broadcast.
    pub fn settle<T>(&self, result: Result<T>) -> Result<T> {
        result.map_err(|error| {
            let writes = self
                .state
                .active
                .lock()
                .unwrap()
                .get(&self.message.operation_id)
                .copied()
                .unwrap_or(0);
            if error.sdk_error().is_none() && writes > 0 {
                error.with_unknown_outcome()
            } else {
                error
            }
        })
    }
}
impl Drop for OperationGuard {
    fn drop(&mut self) {
        self.state
            .active
            .lock()
            .unwrap()
            .remove(&self.message.operation_id);
        let _ = self.state.cancelled.send(self.message.operation_id.clone());
    }
}
