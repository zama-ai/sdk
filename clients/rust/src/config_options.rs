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

    pub(crate) fn wire(&self) -> crate::generated::ModuleVersions {
        use crate::generated::module_versions::Selection;
        let selection = match self {
            Self::Auto => Selection::Auto(crate::generated::Empty {}),
            Self::Pinned(versions) => Selection::Pinned(crate::generated::PinnedModuleVersions {
                tfhe: versions.tfhe.clone(),
                kms: versions.kms.clone(),
                check_compatibility: versions.check_compatibility.clone(),
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
    pub(crate) fn wire(&self) -> crate::generated::ProcessRuntimeConfig {
        crate::generated::ProcessRuntimeConfig {
            wasm_asset_load_mode: self.wasm_asset_load_mode.clone(),
            module_versions: self.module_versions.as_ref().map(ModuleVersions::wire),
            single_thread: self.single_thread,
            number_of_threads: self.number_of_threads,
            auth: self.auth.as_ref().map(Into::into),
        }
    }
}

#[derive(Clone, Debug)]
pub enum ProviderBatch {
    Enabled(bool),
    Options(ProviderBatchOptions),
}
impl ProviderBatch {
    fn wire(&self) -> crate::generated::ProviderBatch {
        use crate::generated::provider_batch::Selection;
        let selection = match self {
            Self::Enabled(enabled) => Selection::Enabled(*enabled),
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
    pub(crate) fn wire(&self) -> crate::generated::HttpProviderConfig {
        crate::generated::HttpProviderConfig {
            headers: self
                .headers
                .as_ref()
                .map(|entries| crate::generated::HttpHeaders {
                    entries: entries.clone().into_iter().collect(),
                }),
            timeout: self.timeout,
            retry_count: self.retry_count,
            retry_delay: self.retry_delay,
            batch: self.batch.as_ref().map(ProviderBatch::wire),
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
    pub(crate) fn wire(&self) -> crate::generated::RelayerConfig {
        crate::generated::RelayerConfig {
            r#type: self.kind.as_str().into(),
            options: self.options.as_ref().map(RelayerOptions::wire),
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
    fn wire(&self) -> crate::generated::RelayerOptions {
        crate::generated::RelayerOptions {
            timeout: self.timeout,
            debug: self.debug,
            batch_rpc_calls: self.batch_rpc_calls,
            module_versions: self.module_versions.as_ref().map(ModuleVersions::wire),
            fhe_encryption_key: self.fhe_encryption_key.as_ref().map(FheEncryptionKey::wire),
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
    fn wire(&self) -> crate::generated::FheEncryptionKey {
        crate::generated::FheEncryptionKey {
            public_key_bytes: Some(crate::generated::FhePublicKeyBytes {
                id: self.public_key_bytes.id.clone(),
                bytes: self.public_key_bytes.bytes.clone(),
            }),
            crs_bytes: Some(crate::generated::FheCrsBytes {
                id: self.crs_bytes.id.clone(),
                capacity: self.crs_bytes.capacity,
                bytes: self.crs_bytes.bytes.clone(),
            }),
            metadata: Some(crate::generated::FheEncryptionKeyMetadata {
                relayer_url: self.metadata.relayer_url.clone(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::{module_versions, provider_batch};

    #[test]
    fn config_preserves_presence_and_raw_key_bytes() {
        let config = ProcessRuntime {
            single_thread: Some(false),
            number_of_threads: Some(0),
            module_versions: Some(ModuleVersions::auto()),
            ..Default::default()
        }
        .wire();
        assert_eq!(config.single_thread, Some(false));
        assert_eq!(config.number_of_threads, Some(0));
        assert!(matches!(
            config.module_versions.unwrap().selection,
            Some(module_versions::Selection::Auto(_))
        ));

        let provider = ProviderOptions {
            headers: Some(BTreeMap::new()),
            timeout: Some(0),
            retry_count: Some(0),
            batch: Some(ProviderBatch::Enabled(false)),
            ..Default::default()
        }
        .wire();
        assert_eq!(provider.headers.unwrap().entries.len(), 0);
        assert_eq!(provider.timeout, Some(0));
        assert_eq!(provider.retry_count, Some(0));
        assert_eq!(
            provider.batch.unwrap().selection,
            Some(provider_batch::Selection::Enabled(false))
        );

        let relayer = RelayerConfig {
            kind: RelayerType::Node,
            options: Some(RelayerOptions {
                batch_rpc_calls: Some(false),
                module_versions: Some(ModuleVersions::Pinned(PinnedModuleVersions::default())),
                fhe_encryption_key: Some(FheEncryptionKey {
                    public_key_bytes: FhePublicKeyBytes {
                        id: "key".into(),
                        bytes: vec![0, 255],
                    },
                    crs_bytes: FheCrsBytes {
                        id: "crs".into(),
                        capacity: 2048,
                        bytes: vec![128],
                    },
                    metadata: FheEncryptionKeyMetadata {
                        chain_id: 11_155_111,
                        relayer_url: "https://relayer.invalid".into(),
                    },
                }),
                ..Default::default()
            }),
        }
        .wire();
        let options = relayer.options.unwrap();
        assert_eq!(options.batch_rpc_calls, Some(false));
        assert!(matches!(
            options.module_versions.unwrap().selection,
            Some(module_versions::Selection::Pinned(_))
        ));
        let key = options.fhe_encryption_key.unwrap();
        assert_eq!(key.public_key_bytes.unwrap().bytes, vec![0, 255]);
        assert_eq!(key.crs_bytes.unwrap().bytes, vec![128]);

        assert!(ProviderOptions::default().wire().headers.is_none());
    }

    #[test]
    fn relayer_map_preserves_omission_and_explicit_empty() {
        let mut config = crate::SdkConfig::new(11_155_111, "http://localhost");
        let wire = crate::generated::ContextConfig::try_from(&config).unwrap();
        assert!(wire.relayers.is_none());

        config.relayers = Some(BTreeMap::new());
        let wire = crate::generated::ContextConfig::try_from(&config).unwrap();
        assert!(wire.relayers.unwrap().entries.is_empty());
    }

    #[test]
    fn secrets_redact_debug_and_preserve_empty_values() {
        use crate::generated::derivation_secret::Value;
        assert_eq!(DerivationSecret::missing().wire().value, None);
        assert_eq!(
            DerivationSecret::text("").wire().value,
            Some(Value::Text(String::new()))
        );
        assert_eq!(
            DerivationSecret::bytes(vec![]).wire().value,
            Some(Value::Bytes(vec![]))
        );
        assert_eq!(
            DerivationSecret::bytes(vec![0, 255]).wire().value,
            Some(Value::Bytes(vec![0, 255]))
        );
        let secret = DerivationSecret::text("synthetic-secret");
        assert_eq!(format!("{secret:?}"), "[REDACTED]");
        assert_eq!(format!("{secret}"), "[REDACTED]");
    }
}
