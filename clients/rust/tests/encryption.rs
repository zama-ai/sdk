use anyhow::Result;
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
use zama_sdk_sidecar::{Address, BigInt, Client, EncryptInput, EncryptParams, RpcError, SdkConfig};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptionScenarios {
    rate_limited: u32,
    cancelled: u32,
    invalid_input: u32,
}

#[tokio::test]
#[ignore = "requires SDK-backed encryption fixture server"]
async fn encryption_preserves_sdk_semantics() -> Result<()> {
    let socket = std::env::var("SIDECAR_ENCRYPT_TEST_SOCKET")?;
    let EncryptionScenarios {
        rate_limited,
        cancelled,
        invalid_input,
    } = serde_json::from_str(&std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../proto/fixtures/encryption-scenarios.json"
    ))?)?;
    let sdk = Client::connect(socket)
        .await?
        .sdk(SdkConfig::new(31337, "http://fixture.invalid"))
        .build()
        .await?;
    let huge: BigInt = (BigInt::from(1) << 256) - 1;
    let address = Address::repeat_byte(0x3c);
    let values = [
        EncryptInput::Bool(true),
        EncryptInput::Bool(false),
        EncryptInput::BoolBigInt(0.into()),
        EncryptInput::BoolBigInt(1.into()),
        EncryptInput::Uint8(255.into()),
        EncryptInput::Uint16(65535.into()),
        EncryptInput::Uint32(4_294_967_295u64.into()),
        EncryptInput::Uint64(u64::MAX.into()),
        EncryptInput::Uint128(u128::MAX.into()),
        EncryptInput::Uint256(huge.clone()),
        EncryptInput::Address(address),
        EncryptInput::Uint8((-1).into()),
    ];
    let params = EncryptParams {
        values: &values,
        contract_address: Address::repeat_byte(0x1a),
        user_address: Address::repeat_byte(0x2b),
    };
    let result = sdk.encrypt(params, None).await?;
    assert_eq!(result.encrypted_values.len(), values.len());
    let proof: Value = serde_json::from_slice(&result.input_proof)?;
    assert_eq!(
        proof["contractAddress"].as_str().unwrap().to_lowercase(),
        format!("{:#x}", params.contract_address)
    );
    assert_eq!(
        proof["userAddress"].as_str().unwrap().to_lowercase(),
        format!("{:#x}", params.user_address)
    );
    assert!(proof.get("timeout").is_none());
    let expected = [
        ("ebool", json!(true)),
        ("ebool", json!(false)),
        ("ebool", json!("0")),
        ("ebool", json!("1")),
        ("euint8", json!("255")),
        ("euint16", json!("65535")),
        ("euint32", json!("4294967295")),
        ("euint64", json!(u64::MAX.to_string())),
        ("euint128", json!(u128::MAX.to_string())),
        ("euint256", json!(huge.to_string())),
        ("eaddress", json!(address.to_checksum(None))),
        ("euint8", json!("-1")),
    ];
    for (actual, (kind, value)) in proof["values"].as_array().unwrap().iter().zip(expected) {
        assert_eq!(actual["type"], kind);
        assert_eq!(actual["value"], value);
    }
    let empty = sdk
        .encrypt(
            EncryptParams {
                values: &[],
                ..params
            },
            Some(0),
        )
        .await?;
    assert!(empty.encrypted_values.is_empty());
    let proof: Value = serde_json::from_slice(&empty.input_proof)?;
    assert_eq!(proof["timeout"], 0);

    let error = sdk.encrypt(params, Some(rate_limited)).await.unwrap_err();
    let error = error.downcast_ref::<RpcError>().unwrap();
    let sdk_error = error.sdk.as_ref().unwrap();
    assert_eq!(sdk_error.code, "RELAYER_REQUEST_FAILED");
    assert!(sdk_error.retryable);
    assert_eq!(sdk_error.retry_after_seconds, Some(7));

    for invalid in [
        EncryptInput::Uint8((-1).into()),
        EncryptInput::Uint8(256.into()),
        EncryptInput::BoolBigInt(2.into()),
    ] {
        let error = sdk
            .encrypt(
                EncryptParams {
                    values: &[invalid],
                    ..params
                },
                Some(invalid_input),
            )
            .await
            .unwrap_err();
        let error = error
            .downcast_ref::<RpcError>()
            .unwrap()
            .sdk
            .as_ref()
            .unwrap();
        assert_eq!(error.code, "ENCRYPTION_FAILED");
        assert!(!error.retryable);
    }

    assert!(
        tokio::time::timeout(
            Duration::from_millis(100),
            sdk.encrypt(params, Some(cancelled)),
        )
        .await
        .is_err()
    );
    let bounded = sdk.clone().with_timeout(Duration::from_millis(100));
    assert!(
        tokio::time::timeout(
            Duration::from_secs(2),
            bounded.encrypt(params, Some(cancelled)),
        )
        .await?
        .is_err()
    );
    assert_eq!(
        sdk.encrypt(params, None).await?.encrypted_values.len(),
        values.len()
    );
    sdk.close().await?;
    Ok(())
}
