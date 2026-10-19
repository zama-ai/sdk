use alloy_provider::Provider;
use alloy_sol_types::sol;
use anyhow::Result;
use zama_sdk::{Address, ClearValue, EncryptedInput, Sdk};

sol! {
    #[sol(rpc)]
    interface ConfidentialToken {
        function name() external view returns (string);
        function confidentialBalanceOf(address account) external view returns (bytes32);
    }
}

pub async fn show_balance(
    sdk: &Sdk,
    provider: &impl Provider,
    token: Address,
    owner: Address,
) -> Result<()> {
    let ctoken = ConfidentialToken::new(token, provider);
    let name = ctoken.name().call().await?;
    let encrypted = ctoken.confidentialBalanceOf(owner).call().await?;
    let address = token.to_checksum(None);
    println!("User Address: {}", owner.to_checksum(None));
    println!("Token: {name} ({address}) https://eth-sepolia.blockscout.com/token/{address}");
    println!("Encrypted balance: {encrypted:#x}");
    let values = sdk
        .decryption()
        .decrypt_values(
            &[EncryptedInput {
                encrypted_value: encrypted,
                contract_address: token,
            }],
            None,
        )
        .await?;
    match values.get(&encrypted) {
        Some(ClearValue::BigInt(balance)) => println!("Decrypted balance: {balance}"),
        _ => anyhow::bail!("unexpected decrypted balance type"),
    }
    Ok(())
}
