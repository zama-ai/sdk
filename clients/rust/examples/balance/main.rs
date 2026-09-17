mod balance;
mod encryption;
mod support;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    let settings = support::Settings::load()?;
    let provider = settings.connect_provider().await?;
    let sdk = settings.create_sdk().await?;
    let result = async {
        encryption::encrypt_inputs(&sdk, settings.token, settings.account.address).await?;
        balance::show_balance(&sdk, &provider, settings.token, settings.account.address).await
    }
    .await;
    let closed = sdk.close().await;
    result?;
    closed?;
    Ok(())
}
