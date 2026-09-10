use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "__type")]
pub enum RelayerAuth {
    BearerToken {
        token: String,
    },
    ApiKeyHeader {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        header: Option<String>,
    },
    ApiKeyCookie {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainConfig {
    pub id: u64,
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<RelayerAuth>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_chain_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relayer_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acl_contract_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kms_contract_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_verifier_contract_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verifying_contract_address_decryption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verifying_contract_address_input_verification: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_address: Option<String>,
}
impl ChainConfig {
    pub fn new(id: u64, rpc_url: impl Into<String>) -> Self {
        Self {
            id,
            network: rpc_url.into(),
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkConfig {
    pub chain_id: u64,
    pub chains: Vec<ChainConfig>,
    #[serde(rename = "permitTTL", skip_serializing_if = "Option::is_none")]
    pub permit_ttl: Option<f64>,
    #[serde(
        rename = "transportKeyPairTTL",
        skip_serializing_if = "Option::is_none"
    )]
    pub transport_key_pair_ttl: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_key_pair_scope: Option<String>,
    #[serde(rename = "registryTTL", skip_serializing_if = "Option::is_none")]
    pub registry_ttl: Option<f64>,
}
impl SdkConfig {
    pub fn new(chain_id: u64, rpc_url: impl Into<String>) -> Self {
        Self::from_chains(chain_id, vec![ChainConfig::new(chain_id, rpc_url)])
    }
    pub fn from_chains(chain_id: u64, chains: Vec<ChainConfig>) -> Self {
        Self {
            chain_id,
            chains,
            permit_ttl: None,
            transport_key_pair_ttl: None,
            transport_key_pair_scope: None,
            registry_ttl: None,
        }
    }
    pub fn with_permit_ttl(mut self, days: f64) -> Self {
        self.permit_ttl = Some(days);
        self
    }
    pub fn with_transport_key_pair_ttl(mut self, seconds: f64) -> Self {
        self.transport_key_pair_ttl = Some(seconds);
        self
    }
    pub fn with_transport_key_pair_scope(mut self, scope: impl Into<String>) -> Self {
        self.transport_key_pair_scope = Some(scope.into());
        self
    }
}
