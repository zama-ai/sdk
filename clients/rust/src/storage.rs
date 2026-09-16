use crate::generated;
use anyhow::Result;
use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

#[async_trait]
pub trait NativeStorage: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;
    async fn set(&self, key: &str, value: Vec<u8>) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
}

#[derive(Clone, Default)]
pub struct MemoryStorage {
    values: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}
#[async_trait]
impl NativeStorage for MemoryStorage {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        Ok(self.values.read().await.get(key).cloned())
    }
    async fn set(&self, key: &str, value: Vec<u8>) -> Result<()> {
        self.values.write().await.insert(key.into(), value);
        Ok(())
    }
    async fn delete(&self, key: &str) -> Result<()> {
        self.values.write().await.remove(key);
        Ok(())
    }
}

/// Clone this binding to share one backend and its credential coordination across SDK contexts.
#[derive(Clone)]
pub struct ApplicationStorage {
    pub(crate) id: String,
    pub(crate) backend: Arc<dyn NativeStorage>,
}
impl ApplicationStorage {
    pub fn new(backend: impl NativeStorage + 'static) -> Self {
        Self::shared(uuid::Uuid::new_v4().to_string(), Arc::new(backend))
    }
    /// Use the same ID for adapters accessing the same durable database namespace.
    pub fn shared(id: impl Into<String>, backend: Arc<dyn NativeStorage>) -> Self {
        Self {
            id: id.into(),
            backend,
        }
    }
}
#[derive(Clone, Default)]
pub enum Storage {
    #[default]
    Memory,
    Persistent(String),
    Application(ApplicationStorage),
}
impl From<ApplicationStorage> for Storage {
    fn from(value: ApplicationStorage) -> Self {
        Self::Application(value)
    }
}
impl Storage {
    pub(crate) fn wire(&self) -> generated::StorageBinding {
        use generated::storage_binding::Backend;
        generated::StorageBinding {
            backend: Some(match self {
                Self::Memory => Backend::Memory(generated::Empty {}),
                Self::Persistent(name) => Backend::Persistent(name.clone()),
                Self::Application(storage) => Backend::Application(storage.id.clone()),
            }),
        }
    }
}
