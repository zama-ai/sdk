use anyhow::Result;
use std::time::Duration;
use zama_sdk_sidecar::{
    Address, BigInt, Client, EncryptInput, EncryptOptions, EncryptParams, ErrorKind, Sdk, SdkConfig,
};

async fn context(client: &Client, scenario: &str) -> Result<Sdk> {
    let mut config = SdkConfig::new(31337, "http://fixture.invalid/");
    config.chains[0].relayer_url = Some(format!("http://fixture.invalid/{scenario}"));
    Ok(client.sdk(config).build().await?)
}

#[tokio::test]
#[ignore = "requires SDK-backed encryption fixture server"]
async fn encryption_preserves_sdk_semantics() -> Result<()> {
    let socket = std::env::var("SIDECAR_ENCRYPT_TEST_SOCKET")?;
    let client = Client::connect(socket).await?;
    let contract_address: Address = "0x1111111111111111111111111111111111111111".parse()?;
    let user_address: Address = "0x2222222222222222222222222222222222222222".parse()?;
    let values = [
        EncryptInput::Uint256((BigInt::from(1) << 256usize) - 1),
        EncryptInput::Bool(false),
        EncryptInput::BoolBigInt(1.into()),
        EncryptInput::Address(user_address),
        EncryptInput::Uint8((-1).into()),
        EncryptInput::Uint8(42.into()),
        EncryptInput::Uint16(42.into()),
        EncryptInput::Uint32(42.into()),
        EncryptInput::Uint64(42.into()),
        EncryptInput::Uint128(42.into()),
    ];
    let params = EncryptParams {
        values: &values,
        contract_address,
        user_address,
    };

    let success = context(&client, "").await?;
    let first = success.encrypt(params, EncryptOptions::default()).await?;
    assert_eq!(first.encrypted_values.len(), values.len());
    assert!(!first.input_proof.is_empty());
    let second = success.encrypt(params, EncryptOptions::default()).await?;
    assert_ne!(first.encrypted_values, second.encrypted_values);
    success
        .encrypt(
            params,
            EncryptOptions {
                timeout_ms: Some(0),
            },
        )
        .await?;
    success
        .encrypt(
            params,
            EncryptOptions {
                timeout_ms: Some(500),
            },
        )
        .await?;

    let rate_limited = context(&client, "rate-limited").await?;
    let error = rate_limited
        .encrypt(params, EncryptOptions::default())
        .await
        .unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Sdk);
    let sdk_error = error.sdk_error().unwrap();
    assert_eq!(sdk_error.code, "RELAYER_REQUEST_FAILED");
    assert!(sdk_error.retryable);
    assert_eq!(sdk_error.retry_after_seconds, Some(7));

    let invalid_input = context(&client, "invalid-input").await?;
    let error = invalid_input
        .encrypt(
            EncryptParams {
                values: &[EncryptInput::Uint8((-1).into())],
                ..params
            },
            EncryptOptions::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Sdk);
    let sdk_error = error.sdk_error().unwrap();
    assert_eq!(sdk_error.code, "ENCRYPTION_FAILED");
    assert!(!sdk_error.retryable);

    let cancelled = context(&client, "cancelled").await?;
    assert!(
        tokio::time::timeout(
            Duration::from_millis(100),
            cancelled.encrypt(params, EncryptOptions::default()),
        )
        .await
        .is_err()
    );

    success.close().await?;
    rate_limited.close().await?;
    invalid_input.close().await?;
    // Never closed, not even on drop, so the driver observes the RPC abort alone.
    std::mem::forget(cancelled);
    Ok(())
}
