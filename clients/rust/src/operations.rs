use crate::generated;
use std::{
    collections::HashSet,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::broadcast;

pub(crate) struct Operations {
    sequence: AtomicU64,
    active: Mutex<HashSet<String>>,
    pub cancelled: broadcast::Sender<String>,
}
impl Operations {
    pub fn new() -> Self {
        Self {
            sequence: AtomicU64::new(1),
            active: Mutex::new(HashSet::new()),
            cancelled: broadcast::channel(128).0,
        }
    }
    pub fn contains(&self, id: &str) -> bool {
        self.active.lock().unwrap().contains(id)
    }
    pub fn start(self: &Arc<Self>, context_id: &str) -> OperationGuard {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        self.active.lock().unwrap().insert(id.clone());
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
