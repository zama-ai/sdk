use crate::{Address, generated};
use anyhow::Result;

#[derive(Clone, Debug)]
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
            relayers: Default::default(),
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

impl From<&RelayerAuth> for generated::ChainAuth {
    fn from(auth: &RelayerAuth) -> Self {
        use generated::chain_auth::Credential;
        let credential = match auth {
            RelayerAuth::BearerToken { token } => Credential::BearerToken(token.clone()),
            RelayerAuth::ApiKeyHeader { value, header } => {
                Credential::ApiKeyHeader(generated::NamedCredential {
                    name: header.clone(),
                    value: value.clone(),
                })
            }
            RelayerAuth::ApiKeyCookie { value, cookie } => {
                Credential::ApiKeyCookie(generated::NamedCredential {
                    name: cookie.clone(),
                    value: value.clone(),
                })
            }
        };
        Self {
            credential: Some(credential),
        }
    }
}
impl TryFrom<&ChainConfig> for generated::ChainConfig {
    type Error = anyhow::Error;
    fn try_from(chain: &ChainConfig) -> Result<Self> {
        fn address(value: &Option<String>) -> Result<Option<Vec<u8>>> {
            value
                .as_ref()
                .map(|value| Ok(value.parse::<Address>()?.to_vec()))
                .transpose()
        }
        fn optional_address(value: &Option<String>) -> Result<Option<Vec<u8>>> {
            match value.as_deref() {
                Some("") => Ok(Some(Vec::new())),
                _ => address(value),
            }
        }
        Ok(Self {
            id: chain.id,
            network: Some(chain.network.clone()),
            auth: chain.auth.as_ref().map(Into::into),
            gateway_chain_id: chain.gateway_chain_id,
            relayer_url: chain.relayer_url.clone(),
            acl_contract_address: address(&chain.acl_contract_address)?,
            kms_contract_address: address(&chain.kms_contract_address)?,
            input_verifier_contract_address: address(&chain.input_verifier_contract_address)?,
            verifying_contract_address_decryption: address(
                &chain.verifying_contract_address_decryption,
            )?,
            verifying_contract_address_input_verification: address(
                &chain.verifying_contract_address_input_verification,
            )?,
            registry_address: optional_address(&chain.registry_address)?,
            executor_address: optional_address(&chain.executor_address)?,
            provider: chain.provider.as_ref().map(crate::ProviderOptions::wire),
        })
    }
}
impl TryFrom<&SdkConfig> for generated::ContextConfig {
    type Error = anyhow::Error;
    fn try_from(config: &SdkConfig) -> Result<Self> {
        Ok(Self {
            chain_id: Some(config.chain_id),
            chains: config
                .chains
                .iter()
                .map(TryInto::try_into)
                .collect::<Result<_>>()?,
            permit_ttl: config.permit_ttl,
            transport_key_pair_ttl: config.transport_key_pair_ttl,
            transport_key_pair_scope: config.transport_key_pair_scope.clone(),
            registry_ttl: config.registry_ttl,
            process_runtime: config
                .process_runtime
                .as_ref()
                .map(crate::ProcessRuntime::wire),
            relayers: config
                .relayers
                .as_ref()
                .map(|entries| generated::RelayerMap {
                    entries: entries
                        .iter()
                        .map(|(chain_id, relayer)| (*chain_id, relayer.wire()))
                        .collect(),
                }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn auth_names_preserve_absence_and_explicit_values() {
        for name in [None, Some(String::new()), Some("X-Partner-Key".into())] {
            let auth = generated::ChainAuth::from(&RelayerAuth::ApiKeyHeader {
                value: "secret".into(),
                header: name.clone(),
            });
            assert_eq!(
                auth.credential,
                Some(generated::chain_auth::Credential::ApiKeyHeader(
                    generated::NamedCredential {
                        name: name.clone(),
                        value: "secret".into()
                    }
                ))
            );
            let auth = generated::ChainAuth::from(&RelayerAuth::ApiKeyCookie {
                value: "secret".into(),
                cookie: name.clone(),
            });
            assert_eq!(
                auth.credential,
                Some(generated::chain_auth::Credential::ApiKeyCookie(
                    generated::NamedCredential {
                        name,
                        value: "secret".into()
                    }
                ))
            );
        }
        let chain =
            generated::ChainConfig::try_from(&ChainConfig::new(11155111, "https://rpc.invalid"))
                .unwrap();
        assert!(chain.auth.is_none());
    }
    #[test]
    fn optional_preset_addresses_preserve_omission_clearing_and_values() {
        for (address, expected) in [
            (None, None),
            (Some(String::new()), Some(vec![])),
            (Some(Address::repeat_byte(1).to_string()), Some(vec![1; 20])),
        ] {
            let mut chain = ChainConfig::new(11155111, "https://rpc.invalid");
            chain.registry_address = address.clone();
            chain.executor_address = address;
            let wire = generated::ChainConfig::try_from(&chain).unwrap();
            assert_eq!(wire.registry_address, expected);
            assert_eq!(wire.executor_address, expected);
        }
        let mut chain = ChainConfig::new(11155111, "https://rpc.invalid");
        chain.acl_contract_address = Some(String::new());
        assert!(generated::ChainConfig::try_from(&chain).is_err());
    }
}
