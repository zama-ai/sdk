use super::*;

#[tokio::test]
async fn encrypt_preserves_wire_values_options_and_output_order() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        if !path.ends_with("/Encrypt") {
            return default_handler(path, bytes);
        }
        captured
            .lock()
            .unwrap()
            .push(EncryptRequest::decode(bytes).unwrap());
        response(EncryptResponse {
            encrypted_values: vec![
                vec![2; 32],
                vec![1; 32],
                vec![3; 32],
                vec![4; 32],
                vec![5; 32],
            ],
            input_proof: vec![0, 255, 128],
        })
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(31337, "http://fixture.invalid"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let values = [
        crate::EncryptInput::Uint256((BigInt::from(1) << 300) + 5),
        crate::EncryptInput::Uint8((-1).into()),
        crate::EncryptInput::Bool(false),
        crate::EncryptInput::BoolBigInt(0.into()),
        crate::EncryptInput::Address(Address::repeat_byte(3)),
    ];
    let params = EncryptParams {
        values: &values,
        contract_address: Address::repeat_byte(1),
        user_address: Address::repeat_byte(2),
    };
    for timeout_ms in [None, Some(0), Some(500)] {
        let result = sdk
            .encrypt(params, EncryptOptions { timeout_ms })
            .await
            .unwrap();
        assert_eq!(
            result.encrypted_values,
            vec![
                B256::repeat_byte(2),
                B256::repeat_byte(1),
                B256::repeat_byte(3),
                B256::repeat_byte(4),
                B256::repeat_byte(5)
            ]
        );
        assert_eq!(result.input_proof, vec![0, 255, 128]);
    }
    let calls = calls.lock().unwrap();
    let first = &calls[0];
    assert_eq!(first.operation.as_ref().unwrap().context_id, "context");
    assert_ne!(first.operation, calls[1].operation);
    assert_eq!(first.contract_address, vec![1; 20]);
    assert_eq!(first.user_address, vec![2; 20]);
    assert_eq!(
        calls.iter().map(|call| call.timeout_ms).collect::<Vec<_>>(),
        vec![None, Some(0), Some(500)]
    );
    use encrypt_input::Value;
    assert_eq!(
        first.values[0].value,
        Some(Value::Euint256(
            ((BigInt::from(1) << 300usize) + BigInt::from(5)).to_string()
        ))
    );
    assert_eq!(first.values[1].value, Some(Value::Euint8("-1".into())));
    assert_eq!(first.values[2].value, Some(Value::Ebool(false)));
    assert_eq!(first.values[3].value, Some(Value::EboolBigint("0".into())));
    assert_eq!(first.values[4].value, Some(Value::Eaddress(vec![3; 20])));
}

#[tokio::test]
async fn encrypt_rejects_malformed_encrypted_value() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/Encrypt") {
            response(EncryptResponse {
                encrypted_values: vec![vec![1; 31]],
                input_proof: vec![],
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(31337, "http://fixture.invalid"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let error = sdk
        .encrypt(
            EncryptParams {
                values: &[crate::EncryptInput::Bool(true)],
                contract_address: Address::ZERO,
                user_address: Address::ZERO,
            },
            EncryptOptions::default(),
        )
        .await
        .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("invalid encrypted handle length"),
        "unexpected error: {error}"
    );
}

#[tokio::test]
async fn encrypt_rejects_mismatched_encrypted_value_count() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/Encrypt") {
            response(EncryptResponse {
                encrypted_values: vec![vec![1; 32]],
                input_proof: vec![],
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(31337, "http://fixture.invalid"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let error = sdk
        .encrypt(
            EncryptParams {
                values: &[
                    crate::EncryptInput::Bool(true),
                    crate::EncryptInput::Bool(false),
                ],
                contract_address: Address::ZERO,
                user_address: Address::ZERO,
            },
            EncryptOptions::default(),
        )
        .await
        .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("encrypted value count does not match inputs"),
        "unexpected error: {error}"
    );
}

#[tokio::test]
async fn dropping_encrypt_and_deadlines_release_operation_guards() {
    let (started, mut starts) = mpsc::unbounded_channel();
    let server = Server::start(Arc::new(move |path, bytes| {
        if !path.ends_with("/Encrypt") {
            return default_handler(path, bytes);
        }
        started
            .send(
                EncryptRequest::decode(bytes)
                    .unwrap()
                    .operation
                    .unwrap()
                    .operation_id,
            )
            .unwrap();
        Response::builder()
            .header("content-type", "application/grpc")
            .body(
                StreamBody::new(futures_util::stream::pending::<
                    Result<Frame<Bytes>, Infallible>,
                >())
                .boxed(),
            )
            .unwrap()
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(31337, "http://fixture.invalid"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let params = EncryptParams {
        values: &[],
        contract_address: Address::ZERO,
        user_address: Address::ZERO,
    };
    let mut operation = Box::pin(sdk.encrypt(params, EncryptOptions::default()));
    let id = tokio::select! {
        result = &mut operation => panic!("unexpected response: {result:?}"),
        id = starts.recv() => id.unwrap(),
        _ = tokio::time::sleep(Duration::from_secs(2)) => panic!("encryption never reached server"),
    };
    assert!(sdk.operations.contains(&id));
    drop(operation);
    assert!(!sdk.operations.contains(&id));
    let bounded = sdk.clone().with_timeout(Duration::from_millis(100));
    assert!(
        tokio::time::timeout(
            Duration::from_secs(2),
            bounded.encrypt(params, EncryptOptions::default())
        )
        .await
        .unwrap()
        .is_err()
    );
    let id = starts.recv().await.unwrap();
    assert!(!sdk.operations.contains(&id));
    assert_eq!(*server.timeouts.lock().unwrap(), vec![false, false, true]);
}
