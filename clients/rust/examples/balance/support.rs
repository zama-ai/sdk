use alloy_provider::{Provider, ProviderBuilder};
use alloy_signer_local::PrivateKeySigner;
use alloy_sol_types::sol;
use anyhow::{Result, ensure};
use std::{collections::HashMap, env};
use zama_sdk_sidecar::{Address, B256, ChainConfig, RelayerAuth, SdkConfig, WalletAccount};

sol! {
    #[sol(rpc)]
    interface ConfidentialToken {
        function name() external view returns (string);
        function confidentialBalanceOf(address account) external view returns (bytes32);
    }
}

pub struct Settings {
    pub socket: String,
    pub account: WalletAccount,
    pub token: Address,
    pub config: SdkConfig,
    pub signer: PrivateKeySigner,
    rpc_url: String,
}
impl Settings {
    pub fn load() -> Result<Self> {
        let values =
            dotenvy::from_path_iter(".env.sidecar.local")?.collect::<Result<HashMap<_, _>, _>>()?;
        let required = |key: &str| {
            values
                .get(key)
                .ok_or_else(|| anyhow::anyhow!("missing config: {key}"))
        };
        let address: Address = required("OWNER_ADDRESS")?.parse()?;
        let token = required("CONFIDENTIAL_TOKEN_ADDRESS")?.parse()?;
        let rpc_url = required("SEPOLIA_RPC_URL")?.clone();
        let signer: PrivateKeySigner = values
            .get("TEST_WALLET_PRIVATE_KEY")
            .ok_or_else(|| anyhow::anyhow!("missing wallet private key"))?
            .parse()
            .map_err(|_| anyhow::anyhow!("invalid wallet private key"))?;
        ensure!(
            signer.address() == address,
            "wallet does not match user address"
        );
        let account = WalletAccount {
            address,
            chain_id: 11_155_111,
        };
        let mut chain = ChainConfig::new(account.chain_id, &rpc_url);
        if let Some(key) = values.get("RELAYER_API_KEY")
            && !key.is_empty()
        {
            chain = chain.with_auth(RelayerAuth::api_key(key));
        }
        Ok(Self {
            socket: env::var("SIDECAR_SOCKET_PATH")
                .unwrap_or_else(|_| "/tmp/zama-sdk-sidecar.sock".into()),
            account,
            token,
            config: SdkConfig::from_chains(account.chain_id, vec![chain]),
            signer,
            rpc_url,
        })
    }
}
pub async fn read_token(settings: &Settings) -> Result<(String, B256)> {
    // Some public RPC gateways return HTTP 404 without a User-Agent.
    let http = reqwest::Client::builder()
        .user_agent("zama-sdk-sidecar-example")
        .build()?;
    let provider = ProviderBuilder::new().connect_reqwest(http, settings.rpc_url.parse()?);
    ensure!(
        provider.get_chain_id().await? == settings.account.chain_id,
        "example requires Sepolia"
    );
    let ctoken = ConfidentialToken::new(settings.token, &provider);
    let name = ctoken.name().call().await?;
    let encrypted = ctoken
        .confidentialBalanceOf(settings.account.address)
        .call()
        .await?;
    Ok((name, encrypted))
}
