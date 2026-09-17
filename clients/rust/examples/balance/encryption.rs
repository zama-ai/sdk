use anyhow::Result;
use zama_sdk_sidecar::{Address, EncryptInput, EncryptOptions, EncryptParams, Sdk};

pub async fn encrypt_inputs(
    sdk: &Sdk,
    contract_address: Address,
    user_address: Address,
) -> Result<()> {
    let inputs = [
        EncryptInput::Uint64(1000.into()),
        EncryptInput::Bool(true),
        EncryptInput::Address(user_address),
    ];
    let result = sdk
        .encrypt(
            EncryptParams {
                values: &inputs,
                contract_address,
                user_address,
            },
            EncryptOptions::default(),
        )
        .await?;
    for (index, handle) in result.encrypted_values.iter().enumerate() {
        println!("Encrypted input {index}: {handle}");
    }
    println!(
        "Input proof: {}",
        alloy_primitives::hex::encode_prefixed(result.input_proof)
    );
    Ok(())
}
