use super::*;
use crate::generated::{module_versions, provider_batch};
use std::collections::BTreeMap;

#[test]
fn auth_names_preserve_absence_and_explicit_values() {
    for name in [None, Some(String::new()), Some("X-Partner-Key".into())] {
        let auth = generated::ChainAuth::from(RelayerAuth::ApiKeyHeader {
            value: "secret".into(),
            header: name.clone(),
        });
        assert_eq!(
            auth.credential,
            Some(generated::chain_auth::Credential::ApiKeyHeader(
                generated::NamedCredential {
                    name: name.clone(),
                    value: "secret".into()
                }
            ))
        );
        let auth = generated::ChainAuth::from(RelayerAuth::ApiKeyCookie {
            value: "secret".into(),
            cookie: name.clone(),
        });
        assert_eq!(
            auth.credential,
            Some(generated::chain_auth::Credential::ApiKeyCookie(
                generated::NamedCredential {
                    name,
                    value: "secret".into()
                }
            ))
        );
    }
    let chain = generated::ChainConfig::try_from(crate::ChainConfig::new(
        11_155_111,
        "https://rpc.invalid",
    ))
    .unwrap();
    assert!(chain.auth.is_none());
}

#[test]
fn auth_debug_redacts_credentials() {
    for auth in [
        RelayerAuth::BearerToken {
            token: "bearer-secret".into(),
        },
        RelayerAuth::ApiKeyHeader {
            value: "header-secret".into(),
            header: None,
        },
        RelayerAuth::ApiKeyCookie {
            value: "cookie-secret".into(),
            cookie: None,
        },
    ] {
        assert_eq!(format!("{auth:?}"), "[REDACTED]");
    }
}

#[test]
fn optional_preset_addresses_preserve_omission_clearing_and_values() {
    for (address, expected) in [
        (None, None),
        (Some(String::new()), Some(vec![])),
        (Some(Address::repeat_byte(1).to_string()), Some(vec![1; 20])),
    ] {
        let mut chain = crate::ChainConfig::new(11_155_111, "https://rpc.invalid");
        chain.registry_address = address.clone();
        chain.executor_address = address;
        let wire = generated::ChainConfig::try_from(chain).unwrap();
        assert_eq!(wire.registry_address, expected);
        assert_eq!(wire.executor_address, expected);
    }
    let mut chain = crate::ChainConfig::new(11_155_111, "https://rpc.invalid");
    chain.acl_contract_address = Some(String::new());
    assert!(generated::ChainConfig::try_from(chain).is_err());
}

#[test]
fn config_preserves_presence_and_raw_key_bytes() {
    let config = ProcessRuntime {
        single_thread: Some(false),
        number_of_threads: Some(0),
        module_versions: Some(crate::ModuleVersions::auto()),
        wasm_asset_load_mode: Some(crate::WasmAssetLoadMode::EmbeddedBase64),
        ..Default::default()
    }
    .wire();
    assert_eq!(config.single_thread, Some(false));
    assert_eq!(config.number_of_threads, Some(0));
    assert_eq!(
        config.wasm_asset_load_mode.as_deref(),
        Some("embedded-base64")
    );
    assert!(matches!(
        config.module_versions.unwrap().selection,
        Some(module_versions::Selection::Auto(_))
    ));

    let pinned = crate::ModuleVersions::Pinned(crate::PinnedModuleVersions {
        tfhe: Some(crate::TfheVersion::V1_6_2),
        kms: Some(crate::KmsVersion::from("0.13.99-rc1")),
        check_compatibility: Some(crate::CompatibilityCheck::Warn),
    })
    .wire();
    let Some(module_versions::Selection::Pinned(pinned)) = pinned.selection else {
        panic!("expected pinned module versions");
    };
    assert_eq!(pinned.tfhe.as_deref(), Some("1.6.2"));
    assert_eq!(pinned.kms.as_deref(), Some("0.13.99-rc1"));
    assert_eq!(pinned.check_compatibility.as_deref(), Some("warn"));

    let provider = ProviderOptions {
        headers: Some(BTreeMap::new()),
        timeout: Some(0),
        retry_count: Some(0),
        batch: Some(crate::ProviderBatch::Enabled(false)),
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

    let public_key_bytes = vec![0, 255];
    let public_key_ptr = public_key_bytes.as_ptr();
    let crs_bytes = vec![128];
    let crs_ptr = crs_bytes.as_ptr();
    let relayer = crate::RelayerConfig {
        kind: RelayerType::Node,
        options: Some(crate::RelayerOptions {
            batch_rpc_calls: Some(false),
            module_versions: Some(crate::ModuleVersions::Pinned(
                crate::PinnedModuleVersions::default(),
            )),
            fhe_encryption_key: Some(crate::FheEncryptionKey {
                public_key_bytes: crate::FhePublicKeyBytes {
                    id: "key".into(),
                    bytes: public_key_bytes,
                },
                crs_bytes: crate::FheCrsBytes {
                    id: "crs".into(),
                    capacity: 2048,
                    bytes: crs_bytes,
                },
                metadata: crate::FheEncryptionKeyMetadata {
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
    let public_key_bytes = key.public_key_bytes.unwrap().bytes;
    let crs_bytes = key.crs_bytes.unwrap().bytes;
    assert_eq!(public_key_bytes, vec![0, 255]);
    assert_eq!(crs_bytes, vec![128]);
    assert_eq!(public_key_bytes.as_ptr(), public_key_ptr);
    assert_eq!(crs_bytes.as_ptr(), crs_ptr);

    assert!(ProviderOptions::default().wire().headers.is_none());
}

#[test]
fn relayer_map_preserves_omission_and_explicit_empty() {
    let config = SdkConfig::new(11_155_111, "http://localhost");
    let wire = generated::ContextConfig::try_from(config).unwrap();
    assert!(wire.relayers.is_none());

    let mut config = SdkConfig::new(11_155_111, "http://localhost");
    config.relayers = Some(BTreeMap::new());
    let wire = generated::ContextConfig::try_from(config).unwrap();
    assert!(wire.relayers.unwrap().entries.is_empty());
}

#[test]
fn secrets_redact_debug_and_preserve_empty_values() {
    use generated::derivation_secret::Value;
    assert_eq!(crate::DerivationSecret::missing().wire().value, None);
    assert_eq!(
        crate::DerivationSecret::text("").wire().value,
        Some(Value::Text(String::new()))
    );
    assert_eq!(
        crate::DerivationSecret::bytes(vec![]).wire().value,
        Some(Value::Bytes(vec![]))
    );
    assert_eq!(
        crate::DerivationSecret::bytes(vec![0, 255]).wire().value,
        Some(Value::Bytes(vec![0, 255]))
    );
    let secret = crate::DerivationSecret::text("synthetic-secret");
    assert_eq!(format!("{secret:?}"), "[REDACTED]");
    assert_eq!(format!("{secret}"), "[REDACTED]");
}

#[tokio::test]
async fn derivation_secret_is_a_separate_instance_option() {
    for secret in [
        None,
        Some(crate::DerivationSecret::missing()),
        Some(crate::DerivationSecret::text("")),
        Some(crate::DerivationSecret::text("synthetic-secret")),
        Some(crate::DerivationSecret::bytes(vec![])),
        Some(crate::DerivationSecret::bytes(vec![0, 255])),
    ] {
        let expected = secret.clone().map(crate::DerivationSecret::wire);
        let config = SdkConfig::new(11_155_111, "http://localhost");
        let expected_config = generated::ContextConfig::try_from(config.clone()).unwrap();
        let server = Server::start(Arc::new(move |path, bytes| {
            if path.ends_with("/CreateContext") {
                let request = CreateContextRequest::decode(bytes).unwrap();
                assert_eq!(request.transport_key_pair_derivation_secret, expected);
                assert_eq!(request.config, Some(expected_config.clone()));
            }
            default_handler(path, bytes)
        }))
        .await;
        let client = Client::connect(&server.socket).await.unwrap();
        let mut builder = client.sdk(config);
        if let Some(secret) = secret {
            builder = builder.transport_key_pair_derivation_secret(secret);
        }
        let sdk = builder.build().await.unwrap();
        sdk.close().await.unwrap();
    }
}
