use anyhow::Result;
use zama_sdk_sidecar::{Address, EncryptInput, EncryptParams, Sdk};

pub async fn run(sdk: &Sdk, contract_address: Address, user_address: Address) -> Result<()> {
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
            None,
        )
        .await?;
    println!("Encrypted inputs: {:?}", result.encrypted_values);
    println!(
        "Input proof: {}",
        alloy_primitives::hex::encode_prefixed(result.input_proof)
    );
    Ok(())
}
