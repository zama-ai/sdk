mod support;

use anyhow::Result;
use zama_sdk_sidecar::{
    ApplicationStorage, ClearValue, Client, EncryptedInput, MemoryStorage, alloy::AlloySigner,
};

#[tokio::main]
async fn main() -> Result<()> {
    let settings = support::Settings::load()?;
    let storage = ApplicationStorage::new(MemoryStorage::default());
    let sdk = Client::connect(&settings.socket)
        .await?
        .sdk(settings.config.clone())
        .signer(
            Some(settings.account),
            AlloySigner::new(settings.signer.clone()),
        )
        .storage(storage)
        .build()
        .await?;
    let (name, encrypted) = support::read_token(&settings).await?;
    let address = settings.token.to_checksum(None);
    println!(
        "User Address: {}",
        settings.account.address.to_checksum(None)
    );
    println!("Token: {name} ({address}) https://eth-sepolia.blockscout.com/token/{address}");
    println!("Encrypted balance: {encrypted:#x}");

    let result = sdk
        .decryption()
        .decrypt_values(
            &[EncryptedInput {
                encrypted_value: encrypted,
                contract_address: settings.token,
            }],
            None,
        )
        .await;
    let closed = sdk.close().await;
    let values = result?;
    closed?;
    match values.get(&encrypted) {
        Some(ClearValue::BigInt(balance)) => println!("Decrypted balance: {balance}"),
        _ => anyhow::bail!("unexpected decrypted balance type"),
    }
    Ok(())
}
