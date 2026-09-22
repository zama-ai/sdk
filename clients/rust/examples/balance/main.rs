mod balance;
mod delegation;
mod encryption;
mod offline;
mod support;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    let settings = support::Settings::load()?;
    let provider = settings.connect_provider().await?;
    let sdk = settings.create_sdk().await?;
    let result = async {
        encryption::encrypt_inputs(&sdk, settings.token, settings.account.address).await?;
        balance::show_balance(&sdk, &provider, settings.token, settings.account.address).await?;
        offline::prepare_and_sign(&sdk, &settings.signer, settings.account, settings.token).await?;
        delegation::manage_delegation(
            &sdk,
            &provider,
            settings.token,
            settings.account.address,
            settings.delegate,
        )
        .await
    }
    .await;
    let closed = sdk.close().await;
    result?;
    closed?;
    Ok(())
}
