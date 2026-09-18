use crate::{Address, B256, Sdk, generated, types::word};
use anyhow::{Context, Result, ensure};

pub struct Delegations(pub(crate) Sdk);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DelegateDecryptionParams {
    pub contract_address: Address,
    pub delegate_address: Address,
    /// Unix time in whole milliseconds; omission requests a permanent delegation.
    pub expiration_date_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RevokeDelegationParams {
    pub contract_address: Address,
    pub delegate_address: Address,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DelegationQuery {
    pub contract_address: Address,
    pub delegator_address: Address,
    pub delegate_address: Address,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DelegationStatus {
    pub is_active: bool,
    pub expiry_timestamp: u64,
}

/// The ACL's sentinel expiry for a permanent delegation.
pub const PERMANENT_DELEGATION_EXPIRY: u64 = u64::MAX;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransactionResult {
    pub transaction_hash: B256,
    pub logs: Vec<TransactionLog>,
}

/// Log emitter address is absent when the provider adapter omits it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransactionLog {
    pub address: Option<Address>,
    pub topics: Vec<B256>,
    pub data: Vec<u8>,
}

impl From<DelegateDecryptionParams> for generated::DelegateDecryption {
    fn from(value: DelegateDecryptionParams) -> Self {
        Self {
            contract_address: value.contract_address.to_vec(),
            delegate_address: value.delegate_address.to_vec(),
            expiration_date_ms: value.expiration_date_ms,
        }
    }
}

impl From<RevokeDelegationParams> for generated::RevokeDelegation {
    fn from(value: RevokeDelegationParams) -> Self {
        Self {
            contract_address: value.contract_address.to_vec(),
            delegate_address: value.delegate_address.to_vec(),
        }
    }
}

impl From<DelegationQuery> for generated::DelegationQuery {
    fn from(value: DelegationQuery) -> Self {
        Self {
            operation: None,
            contract_address: value.contract_address.to_vec(),
            delegator_address: value.delegator_address.to_vec(),
            delegate_address: value.delegate_address.to_vec(),
        }
    }
}

fn transaction_log(log: generated::TransactionLog) -> Result<TransactionLog> {
    let address = log
        .address
        .filter(|bytes| !bytes.is_empty())
        .map(|bytes| {
            ensure!(bytes.len() == 20, "invalid log address length");
            Ok(Address::from_slice(&bytes))
        })
        .transpose()?;
    let topics = log
        .topics
        .iter()
        .map(|topic| word(topic, "transaction log topic"))
        .collect::<Result<_>>()?;
    Ok(TransactionLog {
        address,
        topics,
        data: log.data,
    })
}

fn transaction_result(
    transaction: Option<generated::TransactionResult>,
) -> Result<TransactionResult> {
    let transaction = transaction.context("missing transaction result")?;
    Ok(TransactionResult {
        transaction_hash: word(&transaction.transaction_hash, "transaction hash")?,
        logs: transaction
            .logs
            .into_iter()
            .map(transaction_log)
            .collect::<Result<_>>()?,
    })
}

impl Sdk {
    pub fn delegations(&self) -> Delegations {
        Delegations(self.clone())
    }
}

impl Delegations {
    /// The delegator is the signer account.
    pub async fn delegate_decryption(
        &self,
        delegation: DelegateDecryptionParams,
    ) -> Result<TransactionResult> {
        let response = rpc!(
            &self.0,
            delegate_decryption,
            DelegateDecryptionRequest {
                delegation: Some(delegation.into()),
            }
        )
        .await?;
        transaction_result(response.transaction)
    }

    /// The delegator is the signer account.
    pub async fn revoke_delegation(
        &self,
        delegation: RevokeDelegationParams,
    ) -> Result<TransactionResult> {
        let response = rpc!(
            &self.0,
            revoke_delegation,
            RevokeDelegationRequest {
                delegation: Some(delegation.into()),
            }
        )
        .await?;
        transaction_result(response.transaction)
    }

    /// Reads without requiring a signer.
    pub async fn is_active(&self, query: DelegationQuery) -> Result<bool> {
        Ok(rpc!(
            &self.0,
            is_delegation_active,
            DelegationQuery { ..query.into() }
        )
        .await?
        .is_active)
    }

    /// Reads without requiring a signer; 0 means none, u64::MAX means permanent.
    pub async fn get_expiry(&self, query: DelegationQuery) -> Result<u64> {
        Ok(rpc!(
            &self.0,
            get_delegation_expiry,
            DelegationQuery { ..query.into() }
        )
        .await?
        .expiry_timestamp)
    }

    /// Reads without requiring a signer.
    pub async fn get_status(&self, query: DelegationQuery) -> Result<DelegationStatus> {
        let response = rpc!(
            &self.0,
            get_delegation_status,
            DelegationQuery { ..query.into() }
        )
        .await?;
        Ok(DelegationStatus {
            is_active: response.is_active,
            expiry_timestamp: response.expiry_timestamp,
        })
    }
}
