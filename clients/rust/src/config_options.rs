use std::{borrow::Cow, collections::BTreeMap};

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
                tfhe: versions.tfhe.map(|version| version.0.into_owned()),
                kms: versions.kms.map(|version| version.0.into_owned()),
                check_compatibility: versions
                    .check_compatibility
                    .map(|check| check.as_str().to_owned()),
            }),
        };
        crate::generated::ModuleVersions {
            selection: Some(selection),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PinnedModuleVersions {
    pub tfhe: Option<TfheVersion>,
    pub kms: Option<KmsVersion>,
    pub check_compatibility: Option<CompatibilityCheck>,
}

/// `@zama-fhe/sdk` in the daemon decides the accepted set, so any string is allowed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TfheVersion(Cow<'static, str>);
impl TfheVersion {
    pub const V1_5_3: Self = Self(Cow::Borrowed("1.5.3"));
    pub const V1_6_2: Self = Self(Cow::Borrowed("1.6.2"));

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl From<String> for TfheVersion {
    fn from(value: String) -> Self {
        Self(Cow::Owned(value))
    }
}
impl From<&str> for TfheVersion {
    fn from(value: &str) -> Self {
        Self(Cow::Owned(value.to_owned()))
    }
}

/// `@zama-fhe/sdk` in the daemon decides the accepted set, so any string is allowed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KmsVersion(Cow<'static, str>);
impl KmsVersion {
    pub const V0_13_10: Self = Self(Cow::Borrowed("0.13.10"));
    pub const V0_13_20_0: Self = Self(Cow::Borrowed("0.13.20-0"));

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl From<String> for KmsVersion {
    fn from(value: String) -> Self {
        Self(Cow::Owned(value))
    }
}
impl From<&str> for KmsVersion {
    fn from(value: &str) -> Self {
        Self(Cow::Owned(value.to_owned()))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompatibilityCheck {
    Throw,
    Warn,
    Off,
}
impl CompatibilityCheck {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Throw => "throw",
            Self::Warn => "warn",
            Self::Off => "off",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WasmAssetLoadMode {
    Auto,
    EmbeddedBase64,
    VerifiedBlob,
    PrecheckDirectUrl,
    TrustedDirectUrl,
}
impl WasmAssetLoadMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::EmbeddedBase64 => "embedded-base64",
            Self::VerifiedBlob => "verified-blob",
            Self::PrecheckDirectUrl => "precheck-direct-url",
            Self::TrustedDirectUrl => "trusted-direct-url",
        }
    }
}

/// Applied once per daemon process; the first SDK config wins.
#[derive(Clone, Debug, Default)]
pub struct ProcessRuntime {
    pub wasm_asset_load_mode: Option<WasmAssetLoadMode>,
    pub module_versions: Option<ModuleVersions>,
    pub single_thread: Option<bool>,
    pub number_of_threads: Option<u32>,
    pub auth: Option<crate::RelayerAuth>,
}
impl ProcessRuntime {
    pub(crate) fn wire(self) -> crate::generated::ProcessRuntimeConfig {
        crate::generated::ProcessRuntimeConfig {
            wasm_asset_load_mode: self
                .wasm_asset_load_mode
                .map(|mode| mode.as_str().to_owned()),
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelayerTransport {
    Node,
    Cleartext,
}

#[derive(Clone, Debug)]
pub struct RelayerConfig {
    pub transport: RelayerTransport,
    pub options: Option<RelayerOptions>,
}
impl RelayerConfig {
    pub(crate) fn wire(self) -> crate::generated::RelayerConfig {
        let transport = match self.transport {
            RelayerTransport::Node => crate::generated::RelayerTransport::Node,
            RelayerTransport::Cleartext => crate::generated::RelayerTransport::Cleartext,
        };
        crate::generated::RelayerConfig {
            transport: transport as i32,
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
    /// Sends protection enabled with no derivation secret value.
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
