use crate::{Address, ClientError, ErrorKind, Result, generated};

#[derive(Clone)]
pub enum RelayerAuth {
    BearerToken {
        token: String,
    },
    ApiKeyHeader {
        value: String,
        header: Option<String>,
    },
    ApiKeyCookie {
        value: String,
        cookie: Option<String>,
    },
}
impl std::fmt::Debug for RelayerAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
impl RelayerAuth {
    pub fn api_key(value: impl Into<String>) -> Self {
        Self::ApiKeyHeader {
            value: value.into(),
            header: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ChainConfig {
    pub provider: Option<crate::ProviderOptions>,
    pub id: u64,
    pub network: String,
    pub auth: Option<RelayerAuth>,
    pub gateway_chain_id: Option<u64>,
    pub relayer_url: Option<String>,
    pub acl_contract_address: Option<String>,
    pub kms_contract_address: Option<String>,
    pub input_verifier_contract_address: Option<String>,
    pub verifying_contract_address_decryption: Option<String>,
    pub verifying_contract_address_input_verification: Option<String>,
    pub registry_address: Option<String>,
    pub executor_address: Option<String>,
}
impl ChainConfig {
    pub fn new(id: u64, rpc_url: impl Into<String>) -> Self {
        Self {
            id,
            network: rpc_url.into(),
            provider: None,
            auth: None,
            gateway_chain_id: None,
            relayer_url: None,
            acl_contract_address: None,
            kms_contract_address: None,
            input_verifier_contract_address: None,
            verifying_contract_address_decryption: None,
            verifying_contract_address_input_verification: None,
            registry_address: None,
            executor_address: None,
        }
    }
    pub fn with_auth(mut self, auth: RelayerAuth) -> Self {
        self.auth = Some(auth);
        self
    }
}

#[derive(Clone, Debug)]
pub struct SdkConfig {
    pub process_runtime: Option<crate::ProcessRuntime>,
    pub relayers: Option<std::collections::BTreeMap<u64, crate::RelayerConfig>>,
    pub chain_id: u64,
    pub chains: Vec<ChainConfig>,
    pub permit_ttl: Option<u32>,
    pub transport_key_pair_ttl: Option<u32>,
    pub transport_key_pair_scope: Option<String>,
    pub registry_ttl: Option<u32>,
}
impl SdkConfig {
    pub fn new(chain_id: u64, rpc_url: impl Into<String>) -> Self {
        Self::from_chains(chain_id, vec![ChainConfig::new(chain_id, rpc_url)])
    }
    pub fn from_chains(chain_id: u64, chains: Vec<ChainConfig>) -> Self {
        Self {
            chain_id,
            chains,
            process_runtime: None,
            relayers: None,
            permit_ttl: None,
            transport_key_pair_ttl: None,
            transport_key_pair_scope: None,
            registry_ttl: None,
        }
    }
    pub fn with_permit_ttl(mut self, days: u32) -> Self {
        self.permit_ttl = Some(days);
        self
    }
    pub fn with_transport_key_pair_ttl(mut self, seconds: u32) -> Self {
        self.transport_key_pair_ttl = Some(seconds);
        self
    }
    pub fn with_transport_key_pair_scope(mut self, scope: impl Into<String>) -> Self {
        self.transport_key_pair_scope = Some(scope.into());
        self
    }
}

impl From<RelayerAuth> for generated::ChainAuth {
    fn from(auth: RelayerAuth) -> Self {
        use generated::chain_auth::Credential;
        let credential = match auth {
            RelayerAuth::BearerToken { token } => Credential::BearerToken(token),
            RelayerAuth::ApiKeyHeader { value, header } => {
                Credential::ApiKeyHeader(generated::NamedCredential {
                    name: header,
                    value,
                })
            }
            RelayerAuth::ApiKeyCookie { value, cookie } => {
                Credential::ApiKeyCookie(generated::NamedCredential {
                    name: cookie,
                    value,
                })
            }
        };
        Self {
            credential: Some(credential),
        }
    }
}
impl TryFrom<ChainConfig> for generated::ChainConfig {
    type Error = ClientError;
    fn try_from(chain: ChainConfig) -> Result<Self> {
        fn address(value: Option<String>) -> Result<Option<Vec<u8>>> {
            value
                .map(|value| {
                    let address = value.parse::<Address>().map_err(|error| {
                        ClientError::with_source(
                            ErrorKind::InvalidInput,
                            "invalid contract address",
                            error,
                        )
                    })?;
                    Ok(address.to_vec())
                })
                .transpose()
        }
        fn optional_address(value: Option<String>) -> Result<Option<Vec<u8>>> {
            match value {
                Some(value) if value.is_empty() => Ok(Some(Vec::new())),
                Some(value) => address(Some(value)),
                None => Ok(None),
            }
        }
        Ok(Self {
            id: chain.id,
            network: Some(chain.network),
            auth: chain.auth.map(Into::into),
            gateway_chain_id: chain.gateway_chain_id,
            relayer_url: chain.relayer_url,
            acl_contract_address: address(chain.acl_contract_address)?,
            kms_contract_address: address(chain.kms_contract_address)?,
            input_verifier_contract_address: address(chain.input_verifier_contract_address)?,
            verifying_contract_address_decryption: address(
                chain.verifying_contract_address_decryption,
            )?,
            verifying_contract_address_input_verification: address(
                chain.verifying_contract_address_input_verification,
            )?,
            registry_address: optional_address(chain.registry_address)?,
            executor_address: optional_address(chain.executor_address)?,
            provider: chain.provider.map(crate::ProviderOptions::wire),
        })
    }
}
impl TryFrom<SdkConfig> for generated::ContextConfig {
    type Error = ClientError;
    fn try_from(config: SdkConfig) -> Result<Self> {
        Ok(Self {
            chain_id: Some(config.chain_id),
            chains: config
                .chains
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_>>()?,
            permit_ttl: config.permit_ttl,
            transport_key_pair_ttl: config.transport_key_pair_ttl,
            transport_key_pair_scope: config.transport_key_pair_scope,
            registry_ttl: config.registry_ttl,
            process_runtime: config.process_runtime.map(crate::ProcessRuntime::wire),
            relayers: config.relayers.map(|entries| generated::RelayerMap {
                entries: entries
                    .into_iter()
                    .map(|(chain_id, relayer)| (chain_id, relayer.wire()))
                    .collect(),
            }),
        })
    }
}
