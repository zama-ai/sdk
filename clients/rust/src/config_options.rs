use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub enum ModuleVersions {
    Auto,
    Pinned(PinnedModuleVersions),
}
impl ModuleVersions {
    pub fn auto() -> Self {
        Self::Auto
    }

    pub(crate) fn wire(self) -> crate::generated::ModuleVersions {
        use crate::generated::module_versions::Selection;
        let selection = match self {
            Self::Auto => Selection::Auto(crate::generated::Empty {}),
            Self::Pinned(versions) => Selection::Pinned(crate::generated::PinnedModuleVersions {
                tfhe: versions.tfhe,
                kms: versions.kms,
                check_compatibility: versions.check_compatibility,
            }),
        };
        crate::generated::ModuleVersions {
            selection: Some(selection),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PinnedModuleVersions {
    pub tfhe: Option<String>,
    pub kms: Option<String>,
    pub check_compatibility: Option<String>,
}

/// Applied once per sidecar process; the first SDK config wins.
#[derive(Clone, Debug, Default)]
pub struct ProcessRuntime {
    pub wasm_asset_load_mode: Option<String>,
    pub module_versions: Option<ModuleVersions>,
    pub single_thread: Option<bool>,
    pub number_of_threads: Option<u32>,
    pub auth: Option<crate::RelayerAuth>,
}
impl ProcessRuntime {
    pub(crate) fn wire(self) -> crate::generated::ProcessRuntimeConfig {
        crate::generated::ProcessRuntimeConfig {
            wasm_asset_load_mode: self.wasm_asset_load_mode,
            module_versions: self.module_versions.map(ModuleVersions::wire),
            single_thread: self.single_thread,
            number_of_threads: self.number_of_threads,
            auth: self.auth.map(Into::into),
        }
    }
}

#[derive(Clone, Debug)]
pub enum ProviderBatch {
    Enabled(bool),
    Options(ProviderBatchOptions),
}
impl ProviderBatch {
    fn wire(self) -> crate::generated::ProviderBatch {
        use crate::generated::provider_batch::Selection;
        let selection = match self {
            Self::Enabled(enabled) => Selection::Enabled(enabled),
            Self::Options(options) => Selection::Options(crate::generated::ProviderBatchOptions {
                batch_size: options.batch_size,
                wait: options.wait,
            }),
        };
        crate::generated::ProviderBatch {
            selection: Some(selection),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct ProviderBatchOptions {
    pub batch_size: Option<u32>,
    pub wait: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct ProviderOptions {
    pub headers: Option<BTreeMap<String, String>>,
    pub timeout: Option<u32>,
    pub retry_count: Option<u32>,
    pub retry_delay: Option<u32>,
    pub batch: Option<ProviderBatch>,
    pub polling_interval: Option<u32>,
}
impl ProviderOptions {
    pub(crate) fn wire(self) -> crate::generated::HttpProviderConfig {
        crate::generated::HttpProviderConfig {
            headers: self.headers.map(|entries| crate::generated::HttpHeaders {
                entries: entries.into_iter().collect(),
            }),
            timeout: self.timeout,
            retry_count: self.retry_count,
            retry_delay: self.retry_delay,
            batch: self.batch.map(ProviderBatch::wire),
            polling_interval: self.polling_interval,
        }
    }
}

#[derive(Clone, Debug)]
pub enum RelayerType {
    Node,
    Cleartext,
}
impl RelayerType {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Node => "node",
            Self::Cleartext => "cleartext",
        }
    }
}

#[derive(Clone, Debug)]
pub struct RelayerConfig {
    pub kind: RelayerType,
    pub options: Option<RelayerOptions>,
}
impl RelayerConfig {
    pub(crate) fn wire(self) -> crate::generated::RelayerConfig {
        crate::generated::RelayerConfig {
            r#type: self.kind.as_str().into(),
            options: self.options.map(RelayerOptions::wire),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct RelayerOptions {
    pub timeout: Option<u32>,
    pub debug: Option<bool>,
    pub batch_rpc_calls: Option<bool>,
    pub module_versions: Option<ModuleVersions>,
    pub fhe_encryption_key: Option<FheEncryptionKey>,
}
impl RelayerOptions {
    fn wire(self) -> crate::generated::RelayerOptions {
        crate::generated::RelayerOptions {
            timeout: self.timeout,
            debug: self.debug,
            batch_rpc_calls: self.batch_rpc_calls,
            module_versions: self.module_versions.map(ModuleVersions::wire),
            fhe_encryption_key: self.fhe_encryption_key.map(FheEncryptionKey::wire),
        }
    }
}

#[derive(Clone, Debug)]
pub struct FhePublicKeyBytes {
    pub id: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct FheCrsBytes {
    pub id: String,
    pub capacity: u32,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct FheEncryptionKeyMetadata {
    pub relayer_url: String,
    pub chain_id: u64,
}

#[derive(Clone, Debug)]
pub struct FheEncryptionKey {
    pub public_key_bytes: FhePublicKeyBytes,
    pub crs_bytes: FheCrsBytes,
    pub metadata: FheEncryptionKeyMetadata,
}
impl FheEncryptionKey {
    fn wire(self) -> crate::generated::FheEncryptionKey {
        crate::generated::FheEncryptionKey {
            public_key_bytes: Some(crate::generated::FhePublicKeyBytes {
                id: self.public_key_bytes.id,
                bytes: self.public_key_bytes.bytes,
            }),
            crs_bytes: Some(crate::generated::FheCrsBytes {
                id: self.crs_bytes.id,
                capacity: self.crs_bytes.capacity,
                bytes: self.crs_bytes.bytes,
            }),
            metadata: Some(crate::generated::FheEncryptionKeyMetadata {
                relayer_url: self.metadata.relayer_url,
                chain_id: self.metadata.chain_id,
            }),
        }
    }
}

#[derive(Clone)]
pub struct DerivationSecret(SecretValue);
#[derive(Clone)]
enum SecretValue {
    Missing,
    Text(String),
    Bytes(Vec<u8>),
}
impl DerivationSecret {
    pub fn missing() -> Self {
        Self(SecretValue::Missing)
    }
    pub fn text(value: impl Into<String>) -> Self {
        Self(SecretValue::Text(value.into()))
    }
    pub fn bytes(value: impl Into<Vec<u8>>) -> Self {
        Self(SecretValue::Bytes(value.into()))
    }
    pub(crate) fn wire(self) -> crate::generated::DerivationSecret {
        use crate::generated::derivation_secret::Value;
        crate::generated::DerivationSecret {
            value: match self.0 {
                SecretValue::Missing => None,
                SecretValue::Text(value) => Some(Value::Text(value)),
                SecretValue::Bytes(value) => Some(Value::Bytes(value)),
            },
        }
    }
}
impl std::fmt::Debug for DerivationSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
impl std::fmt::Display for DerivationSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
