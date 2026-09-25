use crate::{
    Address, ClientError, ErrorKind, Result, Sdk, TransactionResult, generated,
    transactions::transaction_result,
};
use std::time::SystemTime;

pub struct Delegations(pub(crate) Sdk);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DelegateDecryptionParams {
    pub contract_address: Address,
    pub delegate_address: Address,
    /// Unix time in whole milliseconds; omission requests a permanent delegation.
    pub expiration_date_ms: Option<u64>,
}

impl DelegateDecryptionParams {
    /// Converts `at` to whole Unix milliseconds with checked arithmetic.
    pub fn expiring_at(
        contract_address: Address,
        delegate_address: Address,
        at: SystemTime,
    ) -> Result<Self> {
        let millis = at
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| {
                ClientError::with_source(
                    ErrorKind::InvalidInput,
                    "expiry predates the unix epoch",
                    error,
                )
            })?
            .as_millis();
        let expiration_date_ms = u64::try_from(millis).map_err(|error| {
            ClientError::with_source(
                ErrorKind::InvalidInput,
                "expiry does not fit in u64 milliseconds",
                error,
            )
        })?;
        Ok(Self {
            contract_address,
            delegate_address,
            expiration_date_ms: Some(expiration_date_ms),
        })
    }
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

pub const PERMANENT_DELEGATION_EXPIRY: u64 = u64::MAX;

/// Builds the wire message from fields directly, so callers that only have the fields
/// (such as offline preparation) never need to construct the online params type.
pub(crate) fn delegate_decryption_wire(
    contract_address: Address,
    delegate_address: Address,
    expiration_date_ms: Option<u64>,
) -> generated::DelegateDecryption {
    generated::DelegateDecryption {
        contract_address: contract_address.to_vec(),
        delegate_address: delegate_address.to_vec(),
        expiration_date_ms,
    }
}

/// Builds the wire message from fields directly, so callers that only have the fields
/// (such as offline preparation) never need to construct the online params type.
pub(crate) fn revoke_delegation_wire(
    contract_address: Address,
    delegate_address: Address,
) -> generated::RevokeDelegation {
    generated::RevokeDelegation {
        contract_address: contract_address.to_vec(),
        delegate_address: delegate_address.to_vec(),
    }
}

impl From<DelegateDecryptionParams> for generated::DelegateDecryption {
    fn from(value: DelegateDecryptionParams) -> Self {
        delegate_decryption_wire(
            value.contract_address,
            value.delegate_address,
            value.expiration_date_ms,
        )
    }
}

impl From<RevokeDelegationParams> for generated::RevokeDelegation {
    fn from(value: RevokeDelegationParams) -> Self {
        revoke_delegation_wire(value.contract_address, value.delegate_address)
    }
}

impl From<DelegationQuery> for generated::DelegationQueryRequest {
    fn from(value: DelegationQuery) -> Self {
        Self {
            operation: None,
            contract_address: value.contract_address.to_vec(),
            delegator_address: value.delegator_address.to_vec(),
            delegate_address: value.delegate_address.to_vec(),
        }
    }
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
            DelegationQueryRequest { ..query.into() }
        )
        .await?
        .is_active)
    }

    /// Reads without requiring a signer; 0 means none, u64::MAX means permanent.
    pub async fn get_expiry(&self, query: DelegationQuery) -> Result<u64> {
        Ok(rpc!(
            &self.0,
            get_delegation_expiry,
            DelegationQueryRequest { ..query.into() }
        )
        .await?
        .expiry_timestamp)
    }

    /// Reads without requiring a signer; 0 means none, u64::MAX means permanent.
    pub async fn get_status(&self, query: DelegationQuery) -> Result<DelegationStatus> {
        let response = rpc!(
            &self.0,
            get_delegation_status,
            DelegationQueryRequest { ..query.into() }
        )
        .await?;
        Ok(DelegationStatus {
            is_active: response.is_active,
            expiry_timestamp: response.expiry_timestamp,
        })
    }
}
