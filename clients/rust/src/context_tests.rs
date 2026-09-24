use super::*;

#[tokio::test]
async fn preserves_context_options_typed_values_and_sdk_errors() {
    let revoked = Arc::new(Mutex::new(Vec::new()));
    let observed = revoked.clone();
    let mut config = SdkConfig::new(11155111, "https://rpc.invalid").with_permit_ttl(90);
    config.process_runtime = Some(ProcessRuntime {
        module_versions: Some(crate::ModuleVersions::auto()),
        single_thread: Some(false),
        number_of_threads: Some(0),
        auth: Some(RelayerAuth::api_key("runtime-secret")),
        ..Default::default()
    });
    config.chains[0].provider = Some(ProviderOptions {
        headers: Some(std::collections::BTreeMap::new()),
        timeout: Some(0),
        retry_count: Some(0),
        batch: Some(crate::ProviderBatch::Enabled(false)),
        ..Default::default()
    });
    config.relayers = Some(std::collections::BTreeMap::from([(
        11155111,
        crate::RelayerConfig {
            transport: crate::RelayerTransport::Node,
            options: Some(crate::RelayerOptions {
                batch_rpc_calls: Some(false),
                fhe_encryption_key: Some(crate::FheEncryptionKey {
                    public_key_bytes: crate::FhePublicKeyBytes {
                        id: "key".into(),
                        bytes: vec![0, 255],
                    },
                    crs_bytes: crate::FheCrsBytes {
                        id: "crs".into(),
                        capacity: 2048,
                        bytes: vec![128],
                    },
                    metadata: crate::FheEncryptionKeyMetadata {
                        relayer_url: "https://relayer.invalid".into(),
                        chain_id: 11155111,
                    },
                }),
                ..Default::default()
            }),
        },
    )]));
    let expected_config = generated::ContextConfig::try_from(config.clone()).unwrap();
    let handler = move |path: &str, bytes: &[u8]| match path.rsplit('/').next().unwrap() {
        "CreateContext" => {
            let request = CreateContextRequest::decode(bytes).unwrap();
            assert!(!request.signer_enabled);
            assert!(request.account.is_none());
            assert_eq!(request.config, Some(expected_config.clone()));
            response(CreateContextResponse {
                context_id: "context".into(),
            })
        }
        "DecryptValues" => {
            let request = DecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.operation.unwrap().context_id, "context");
            assert_eq!(request.timeout_ms, Some(1));
            use clear_value::Value;
            response(DecryptValuesResponse {
                values: [
                    Value::BigintValue("340282366920938463463374607431768211457".into()),
                    Value::BoolValue(false),
                    Value::StringValue("0x1234".into()),
                    Value::UndefinedValue(Empty {}),
                    Value::NumberValue(4_294_967_295),
                ]
                .into_iter()
                .enumerate()
                .map(|(i, value)| ClearEntry {
                    encrypted_value: vec![i as u8; 32],
                    value: Some(generated::ClearValue { value: Some(value) }),
                })
                .collect(),
            })
        }
        "DelegatedDecryptValues" => {
            let request = DelegatedDecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.delegator_address, vec![3; 20]);
            assert!(request.account_address.is_none());
            assert_eq!(request.wait_for_propagation, Some(false));
            response(DecryptValuesResponse { values: vec![] })
        }
        "DelegatedBatchDecryptValues" => {
            let request = DelegatedBatchDecryptValuesRequest::decode(bytes).unwrap();
            assert_eq!(request.account_address, Some(vec![4; 20]));
            assert_eq!(request.max_concurrency, Some(2));
            response(DelegatedBatchDecryptValuesResponse {
                items: vec![generated::BatchItem {
                    encrypted_value: vec![5; 32],
                    contract_address: vec![6; 20],
                    result: Some(generated::batch_item::Result::Error(generated::SdkError {
                        code: "RELAYER_REQUEST_FAILED".into(),
                        message: "busy".into(),
                        retryable: true,
                        retry_after_seconds: Some(1),
                    })),
                }],
            })
        }
        "DecryptPublicValues" => response(DecryptPublicValuesResponse {
            values: vec![],
            abi_encoded_clear_values: vec![1, 2],
            decryption_proof: vec![3, 4],
        }),
        "RevokePermits" => {
            observed
                .lock()
                .unwrap()
                .push(RevokePermitsRequest::decode(bytes).unwrap().contracts);
            response(Empty {})
        }
        "PreparePermit" => {
            let request = PreparePermitRequest::decode(bytes).unwrap();
            assert_eq!(request.signer_address, vec![7; 20]);
            assert_eq!(request.delegator_address, Some(vec![8; 20]));
            assert_eq!(request.duration_days, Some(1));
            response(PreparePermitResponse {
                prepared_permit: vec![0, 255, 128, 1],
                typed_data_json: "{}".into(),
            })
        }
        "RegisterPermit" => {
            let request = RegisterPermitRequest::decode(bytes).unwrap();
            assert_eq!(request.prepared_permit, vec![0, 255, 128, 1]);
            assert_eq!(request.signature, vec![42]);
            response(RegisterPermitResponse {})
        }
        "UpdateAccount" => {
            assert!(
                UpdateAccountRequest::decode(bytes)
                    .unwrap()
                    .account
                    .is_none()
            );
            response(Empty {})
        }
        "HasPermit" => Response::builder()
            .header("content-type", "application/grpc")
            .header("grpc-status", "14")
            .header("grpc-message", "busy")
            .header("zama-error-code", "RELAYER_REQUEST_FAILED")
            .header("zama-error-retryable", "true")
            .header("zama-error-retry-after-seconds", "1")
            .body(Full::new(Bytes::new()).boxed())
            .unwrap(),
        _ => default_handler(path, bytes),
    };
    let server = Server::start(Arc::new(handler)).await;
    let client = Client::connect(&server.socket).await.unwrap();
    let sdk = client
        .create_context(config, SignerConfig::Disabled)
        .await
        .unwrap();
    let values = sdk.decryption().decrypt_values(&[], Some(1)).await.unwrap();
    assert_eq!(
        values[&B256::ZERO],
        crate::ClearValue::BigInt("340282366920938463463374607431768211457".parse().unwrap())
    );
    assert_eq!(
        values[&B256::repeat_byte(1)],
        crate::ClearValue::Bool(false)
    );
    assert_eq!(
        values[&B256::repeat_byte(2)],
        crate::ClearValue::String("0x1234".into())
    );
    assert_eq!(values[&B256::repeat_byte(3)], crate::ClearValue::Undefined);
    assert_eq!(
        values[&B256::repeat_byte(4)],
        crate::ClearValue::Number(4_294_967_295)
    );
    sdk.decryption()
        .delegated_decrypt_values(
            &[],
            Address::repeat_byte(3),
            DelegatedOptions {
                wait_for_propagation: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let items = sdk
        .decryption()
        .delegated_batch_decrypt_values(
            &[],
            Address::repeat_byte(3),
            DelegatedBatchOptions {
                account_address: Some(Address::repeat_byte(4)),
                max_concurrency: Some(2),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let error = items[0].result.as_ref().unwrap_err();
    assert!(error.retryable);
    assert_eq!(error.retry_after_seconds, Some(1));
    let public = sdk
        .decryption()
        .decrypt_public_values(&[], None)
        .await
        .unwrap();
    assert_eq!(public.decryption_proof, vec![3, 4]);
    assert_eq!(public.abi_encoded_clear_values, vec![1, 2]);
    sdk.permits().revoke_permits(None).await.unwrap();
    sdk.permits().revoke_permits(Some(&[])).await.unwrap();
    assert!(revoked.lock().unwrap()[0].is_none());
    assert!(
        revoked.lock().unwrap()[1]
            .as_ref()
            .unwrap()
            .addresses
            .is_empty()
    );
    let prepared = sdk
        .offline()
        .prepare_permit(PreparePermit {
            signer: Address::repeat_byte(7),
            contracts: &[],
            delegator: Some(Address::repeat_byte(8)),
            duration_days: Some(1),
        })
        .await
        .unwrap();
    assert_eq!(prepared.typed_data, serde_json::json!({}));
    sdk.permits()
        .register_permit(&prepared.envelope, &[42])
        .await
        .unwrap();
    sdk.update_account(None).await.unwrap();
    let error = sdk.permits().has_permit(&[]).await.unwrap_err();
    assert_eq!(error.kind(), crate::ErrorKind::Transport);
    let status = std::error::Error::source(&error)
        .unwrap()
        .downcast_ref::<tonic::Status>()
        .unwrap();
    assert_eq!(status.code(), tonic::Code::Unavailable);
    assert_eq!(error.sdk_error().unwrap().retry_after_seconds, Some(1));
    assert!(error.sdk_error().unwrap().retryable);
    sdk.close().await.unwrap();
    assert!(
        server
            .timeouts
            .lock()
            .unwrap()
            .iter()
            .all(|present| !present)
    );
}

#[tokio::test]
async fn deadline_covers_stalled_response_body() {
    let server = Server::start(Arc::new(|_, _| {
        Response::builder()
            .header("content-type", "application/grpc")
            .body(
                StreamBody::new(futures_util::stream::pending::<
                    std::result::Result<Frame<Bytes>, Infallible>,
                >())
                .boxed(),
            )
            .unwrap()
    }))
    .await;
    let client = Client::connect(&server.socket)
        .await
        .unwrap()
        .with_timeout(Duration::from_millis(100));
    let result = tokio::time::timeout(Duration::from_secs(1), client.sdk_version())
        .await
        .expect("client deadline failed");
    assert_eq!(result.unwrap_err().kind(), crate::ErrorKind::Timeout);
    assert_eq!(*server.timeouts.lock().unwrap(), vec![true]);
}
