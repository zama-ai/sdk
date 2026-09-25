use alloy_provider::{Provider, ProviderBuilder};
use alloy_signer_local::PrivateKeySigner;
use anyhow::{Result, ensure};
use std::{collections::HashMap, env};
use zama_sdk::{
    Address, ApplicationStorage, ChainConfig, Client, DerivationSecret, MemoryStorage,
    ProcessRuntime, ProviderOptions, RelayerAuth, RelayerConfig, RelayerOptions, RelayerTransport,
    Sdk, SdkConfig, Signer, Storage, WalletAccount, alloy::AlloySigner,
};

pub struct Settings {
    pub socket: String,
    pub account: WalletAccount,
    pub token: Address,
    pub delegate: Address,
    pub config: SdkConfig,
    pub signer: PrivateKeySigner,
    rpc_url: String,
    storage: Storage,
    derivation_secret: Option<DerivationSecret>,
}
impl Settings {
    pub fn load() -> Result<Self> {
        let values = dotenvy::from_path_iter(".env.daemon.local")
            .map_err(|_| anyhow::anyhow!("cannot read example config"))?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(|_| anyhow::anyhow!("cannot parse example config"))?;
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
        let delegate: Address = match values.get("DELEGATE_ADDRESS").map(String::as_str) {
            Some(value) if !value.is_empty() => value.parse()?,
            _ => "0x2222222222222222222222222222222222222222"
                .parse()
                .unwrap(),
        };
        ensure!(
            delegate != address,
            "DELEGATE_ADDRESS must differ from OWNER_ADDRESS"
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
        if let Some(timeout) = optional_number(&values, "SDK_RPC_TIMEOUT_MS")? {
            chain.provider = Some(ProviderOptions {
                timeout: Some(timeout),
                ..Default::default()
            });
        }
        let mut config = SdkConfig::from_chains(account.chain_id, vec![chain]);
        if let Some(enabled) = optional_bool(&values, "SDK_SINGLE_THREAD")? {
            config.process_runtime = Some(ProcessRuntime {
                single_thread: Some(enabled),
                ..Default::default()
            });
        }
        if let Some(enabled) = optional_bool(&values, "SDK_BATCH_RPC_CALLS")? {
            config.relayers = Some(std::collections::BTreeMap::from([(
                account.chain_id,
                RelayerConfig {
                    transport: RelayerTransport::Node,
                    options: Some(RelayerOptions {
                        batch_rpc_calls: Some(enabled),
                        ..Default::default()
                    }),
                },
            )]));
        }
        Ok(Self {
            socket: env::var("ZAMA_SDK_DAEMON_SOCKET_PATH")
                .unwrap_or_else(|_| "/tmp/zama-sdk.sock".into()),
            account,
            token,
            delegate,
            config,
            signer,
            rpc_url,
            storage: example_storage(&values)?,
            derivation_secret: values
                .get("TRANSPORT_KEY_PAIR_DERIVATION_SECRET")
                .map(|value| DerivationSecret::text(value.clone())),
        })
    }

    pub async fn connect_provider(&self) -> Result<impl Provider> {
        let provider =
            ProviderBuilder::new().connect_reqwest(http_client()?, self.rpc_url.parse()?);
        ensure!(
            provider.get_chain_id().await? == self.account.chain_id,
            "example requires Sepolia"
        );
        Ok(provider)
    }

    pub fn wallet(&self) -> Result<impl Signer + use<>> {
        // Alloy's cached nonce manager can advance past a failed fill and gap later writes.
        let provider = ProviderBuilder::new()
            .disable_recommended_fillers()
            .with_gas_estimation()
            .with_blob_gas_estimation()
            .with_simple_nonce_management()
            .fetch_chain_id()
            .wallet(self.signer.clone())
            .connect_reqwest(http_client()?, self.rpc_url.parse()?);
        Ok(AlloySigner::new(self.signer.clone()).with_transactions(provider))
    }

    pub async fn create_sdk(&self) -> Result<Sdk> {
        let mut builder = Client::connect(&self.socket)
            .await?
            .sdk(self.config.clone())
            .signer(Some(self.account), self.wallet()?)
            .storage(self.storage.clone());
        if let Some(secret) = &self.derivation_secret {
            builder = builder.transport_key_pair_derivation_secret(secret.clone());
        }
        Ok(builder.events(crate::events::Diagnostics).build().await?)
    }
}

fn http_client() -> Result<reqwest::Client> {
    // Some public RPC gateways return HTTP 404 without a User-Agent.
    Ok(reqwest::Client::builder()
        .user_agent("zama-sdk-example")
        .build()?)
}

fn example_storage(values: &HashMap<String, String>) -> Result<Storage> {
    match values
        .get("CREDENTIAL_STORAGE")
        .map(String::as_str)
        .unwrap_or("application-memory")
    {
        "" | "application-memory" => Ok(ApplicationStorage::new(MemoryStorage::default()).into()),
        "daemon-memory" => Ok(Storage::Memory),
        "persistent" => Ok(Storage::Persistent(
            values
                .get("CREDENTIAL_STORE_NAME")
                .ok_or_else(|| anyhow::anyhow!("missing CREDENTIAL_STORE_NAME"))?
                .clone(),
        )),
        _ => anyhow::bail!("invalid CREDENTIAL_STORAGE"),
    }
}

fn optional_bool(values: &HashMap<String, String>, key: &str) -> Result<Option<bool>> {
    values
        .get(key)
        .filter(|value| !value.is_empty())
        .map(|value| match value.to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(true),
            "false" | "0" => Ok(false),
            _ => Err(anyhow::anyhow!("invalid {key}")),
        })
        .transpose()
}

fn optional_number(values: &HashMap<String, String>, key: &str) -> Result<Option<u32>> {
    values
        .get(key)
        .filter(|value| !value.is_empty())
        .map(|value| value.parse().map_err(|_| anyhow::anyhow!("invalid {key}")))
        .transpose()
}
