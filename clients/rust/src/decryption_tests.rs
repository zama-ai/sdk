use super::*;

#[tokio::test]
async fn delegated_batch_decrypt_rejects_a_malformed_contract_address_instead_of_panicking() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/DelegatedBatchDecryptValues") {
            response(DelegatedBatchDecryptValuesResponse {
                items: vec![generated::BatchItem {
                    encrypted_value: vec![1; 32],
                    contract_address: vec![2; 19],
                    result: Some(generated::batch_item::Result::Value(
                        generated::ClearValue {
                            value: Some(generated::clear_value::Value::BoolValue(true)),
                        },
                    )),
                }],
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
        .decryption()
        .delegated_batch_decrypt_values(&[], Address::ZERO, DelegatedBatchOptions::default())
        .await
        .unwrap_err();
    assert!(
        error.to_string().contains("invalid batch contract address"),
        "unexpected error: {error}"
    );
}
