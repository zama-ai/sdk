//! Rust client for the Zama SDK daemon over a Unix socket.
//!
//! The daemon protocol is beta: minor releases can break the wire contract and this API.
//!
//! Connect with [`Client::connect`], build an [`Sdk`], and await [`Sdk::close`] when
//! finished; dropping the last handle only attempts best-effort cleanup on a live
//! Tokio runtime.
//!
//! ```no_run
//! use zama_sdk::{Client, SdkConfig};
//!
//! # async fn example() -> zama_sdk::Result<()> {
//! let client = Client::connect("/run/zama/sdk.sock").await?;
//! let sdk = client
//!     .sdk(SdkConfig::new(11155111, "https://rpc.example"))
//!     .build()
//!     .await?;
//! sdk.close().await?;
//! # Ok(())
//! # }
//! ```

#[macro_use]
mod macros;
#[cfg(feature = "alloy")]
pub mod alloy;
mod builder;
mod channel;
mod client;
mod config;
mod config_options;
mod decryption;
mod delegations;
mod encryption;
mod error;
mod event_channel;
mod events;
mod generated;
mod lifetime;
mod offline;
mod operations;
mod permits;
mod sdk;
mod signer;
mod storage;
mod storage_channel;
mod transactions;
mod types;

pub use alloy_primitives::{Address, B256};
pub use async_trait::async_trait;
pub use builder::SdkBuilder;
pub use client::Client;
pub use config::{ChainConfig, RelayerAuth, SdkConfig};
pub use config_options::{
    CompatibilityCheck, DerivationSecret, FheCrsBytes, FheEncryptionKey, FheEncryptionKeyMetadata,
    FhePublicKeyBytes, KmsVersion, ModuleVersions, PinnedModuleVersions, ProcessRuntime,
    ProviderBatch, ProviderBatchOptions, ProviderOptions, RelayerConfig, RelayerOptions,
    RelayerTransport, TfheVersion, WasmAssetLoadMode,
};
pub use decryption::{
    BatchItem, Decryption, DelegatedBatchOptions, DelegatedOptions, PublicDecryption,
};
pub use delegations::{
    DelegateDecryptionParams, DelegationQuery, DelegationStatus, Delegations,
    PERMANENT_DELEGATION_EXPIRY, RevokeDelegationParams,
};
pub use encryption::{EncryptInput, EncryptOptions, EncryptParams, EncryptResult};
pub use error::{ClientError, ErrorKind, Result, SdkError};
pub use events::{
    ApprovalStep, EventContext, EventEnum, EventHandler, EventKind, EventOperation, Notification,
    OperationProgress, ProgressKind, SdkEvent, SdkEventKind, ShieldPath,
};
pub use num_bigint::BigInt;
pub use offline::{
    Offline, PrepareFees, PrepareOptions, PreparePermit, PrepareTransaction, PreparedPermit,
    PreparedTransaction, Transaction, TransactionKind,
};
pub use permits::Permits;
pub use sdk::{CallbackChannel, Sdk};
pub use signer::{Signer, SigningRequest};
pub use storage::{ApplicationStorage, MemoryStorage, NativeStorage, Storage};
pub use tokio_util::sync::CancellationToken;
pub use transactions::{ContractWriteRequest, TransactionLog, TransactionResult};
pub use types::{ClearValue, ClearValues, EncryptedInput, WalletAccount};

#[cfg(test)]
mod tests;
